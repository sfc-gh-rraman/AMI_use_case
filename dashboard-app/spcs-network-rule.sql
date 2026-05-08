-- SPCS deployment DDL for AMI 2.0 Operations Console
-- Service: AMI_DEMO.AMI_MART.AMI_DASHBOARD_SVC
-- URL: https://bibm6off-sfpscogs-rraman-aws-si.snowflakecomputing.app

-- 1. Network rule — Carto map tile CDN egress
CREATE OR REPLACE NETWORK RULE AMI_DEMO.AMI_MART.AMI_MAP_TILES_RULE
  MODE = EGRESS
  TYPE = HOST_PORT
  VALUE_LIST = (
    'basemaps.cartocdn.com:443',
    'a.basemaps.cartocdn.com:443',
    'b.basemaps.cartocdn.com:443',
    'c.basemaps.cartocdn.com:443',
    'd.basemaps.cartocdn.com:443',
    'cartodb-basemaps-a.global.ssl.fastly.net:443',
    'cartodb-basemaps-b.global.ssl.fastly.net:443',
    'cartodb-basemaps-c.global.ssl.fastly.net:443'
  );

-- 2. External access integration (account-level)
CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION AMI_MAP_TILES_EAI
  ALLOWED_NETWORK_RULES = (AMI_DEMO.AMI_MART.AMI_MAP_TILES_RULE)
  ENABLED = TRUE;

-- 3. Attach to running service
ALTER SERVICE AMI_DEMO.AMI_MART.AMI_DASHBOARD_SVC
  SET EXTERNAL_ACCESS_INTEGRATIONS = (AMI_MAP_TILES_EAI);

-- 4. Verify
SELECT SYSTEM$GET_SERVICE_STATUS('AMI_DEMO.AMI_MART.AMI_DASHBOARD_SVC');
SHOW ENDPOINTS IN SERVICE AMI_DEMO.AMI_MART.AMI_DASHBOARD_SVC;
