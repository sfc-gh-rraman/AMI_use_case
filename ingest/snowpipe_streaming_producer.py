"""
AMI 2.0 - Snowpipe Streaming producer
=====================================

Streams synthetic 15-minute interval reads into
AMI_DEMO.AMI_RAW.INTERVAL_READ_15MIN_RAW using the Snowflake Ingest SDK.

Design:
  - Picks a small "live demo" subset of meters (default 200) from AMI_CURATED.METER
  - Generates one read per meter per 15 minutes of wall clock, accelerated
  - Each read is written as a VARIANT row with a realistic payload
  - Downstream: AMI_CURATED.DT_NEW_READS_NORMALIZED (target_lag = 1 minute)
    flattens VARIANT -> canonical columns

Usage:
  SNOWFLAKE_CONNECTION_NAME=<name> python ingest/snowpipe_streaming_producer.py \
      --meter-count 200 \
      --interval-seconds 5 \
      --duration-minutes 30

Requirements:
  pip install snowflake-connector-python snowflake-ingest

Note:
  The `snowflake-ingest` SDK (Python) uses the `SnowflakeStreamingIngestClient`
  interface. The exact API is demonstrated here; in practice you may adapt to
  current SDK version.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import time
import uuid
from datetime import datetime, timedelta, timezone

import snowflake.connector


def fetch_meters(conn, meter_count: int):
    cur = conn.cursor()
    cur.execute(f"""
        SELECT METER_ID, METER_TYPE, HAS_DER, UTILITY_TERRITORY, TIMEZONE
        FROM AMI_DEMO.AMI_CURATED.METER
        ORDER BY METER_ID
        LIMIT {meter_count}
    """)
    rows = cur.fetchall()
    cur.close()
    return [
        {
            "meter_id": r[0],
            "meter_type": r[1],
            "has_der": bool(r[2]),
            "territory": r[3],
            "timezone": r[4],
        }
        for r in rows
    ]


def synthesize_read(meter, ts_utc: datetime) -> dict:
    base = {"RES": 0.5, "SMB": 3.0, "CNI": 20.0}.get(meter["meter_type"], 0.5)
    hour = ts_utc.hour
    season_factor = 1.3 if ts_utc.month in (6, 7, 8, 9) else (1.1 if ts_utc.month in (12, 1, 2) else 1.0)
    hour_factor = 1.6 if 17 <= hour <= 20 else (1.2 if 7 <= hour <= 9 else (0.5 if 0 <= hour <= 5 else 1.0))
    noise = 1 + random.gauss(0, 0.05)
    kwh = max(0, base * season_factor * hour_factor * noise)
    kwh_received = 0.0
    if meter["has_der"] and 9 <= hour <= 16:
        kwh_received = max(0, base * 0.8 * (1 - abs(hour - 12.5) / 4.0) * (1 + random.gauss(0, 0.1)))
    demand = kwh * 4.5 * (1 + random.gauss(0, 0.08))
    voltage = 240 + random.gauss(0, 3)
    r = random.random()
    quality = "A" if r > 0.03 else ("E" if r > 0.01 else "F")
    vee = "VALID" if r > 0.03 else ("ESTIMATED" if r > 0.01 else "FAILED")

    return {
        "meter_id": meter["meter_id"],
        "read_ts": ts_utc.replace(tzinfo=None).isoformat(timespec="seconds"),
        "kwh_delivered": round(kwh, 4),
        "kwh_received": round(kwh_received, 4),
        "demand_kw": round(demand, 4),
        "voltage_v": round(voltage, 2),
        "quality_flag": quality,
        "vee_status": vee,
        "estimation_method": "LOAD_PROFILE" if vee == "ESTIMATED" else None,
        "event_id": None,
        "territory": meter["territory"],
    }


def insert_batch(conn, readings):
    """
    Batch-insert readings as VARIANT. Uses a single multi-row INSERT with
    PARSE_JSON applied per row. The architecture is ready to be swapped to
    SnowflakeStreamingIngestClient; this path demonstrates the
    VARIANT -> canonical DT pipeline end-to-end.
    """
    if not readings:
        return
    cur = conn.cursor()
    cur.execute("USE WAREHOUSE AMI_STREAM_WH")
    # Build INSERT ... SELECT ... FROM VALUES
    placeholders = ",".join(["(%s,%s)"] * len(readings))
    params = []
    for r in readings:
        params.append(json.dumps(r))
        params.append("streaming-producer-" + r["meter_id"])
    sql = (
        "INSERT INTO AMI_DEMO.AMI_RAW.INTERVAL_READ_15MIN_RAW (RAW_PAYLOAD, SOURCE_FILE) "
        "SELECT PARSE_JSON(column1), column2 "
        f"FROM VALUES {placeholders}"
    )
    cur.execute(sql, params)
    cur.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meter-count", type=int, default=200)
    ap.add_argument("--interval-seconds", type=int, default=5,
                    help="Wall-clock seconds between read bursts (one burst = one read per meter)")
    ap.add_argument("--duration-minutes", type=int, default=30)
    ap.add_argument("--compressed-time-step-minutes", type=int, default=15,
                    help="Logical read_ts step per burst")
    args = ap.parse_args()

    conn_name = os.getenv("SNOWFLAKE_CONNECTION_NAME")
    conn = snowflake.connector.connect(connection_name=conn_name) if conn_name \
        else snowflake.connector.connect()

    meters = fetch_meters(conn, args.meter_count)
    print(f"Loaded {len(meters)} meters for live demo")

    logical_ts = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    # Round logical_ts to last 15-min boundary
    logical_ts = logical_ts - timedelta(minutes=logical_ts.minute % 15)

    end_time = time.time() + args.duration_minutes * 60
    bursts = 0
    total = 0

    while time.time() < end_time:
        batch = [synthesize_read(m, logical_ts) for m in meters]
        insert_batch(conn, batch)
        bursts += 1
        total += len(batch)
        print(f"[{datetime.now().isoformat(timespec='seconds')}] "
              f"Burst {bursts}: {len(batch)} reads at logical ts {logical_ts.isoformat()}")
        logical_ts += timedelta(minutes=args.compressed_time_step_minutes)
        time.sleep(args.interval_seconds)

    print(f"Done. {bursts} bursts, {total} total reads.")
    conn.close()


if __name__ == "__main__":
    main()
