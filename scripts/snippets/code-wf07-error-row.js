const item = $input.first().json;

let leadId = null;
try {
  const runData = item.execution?.data?.resultData?.runData;
  if (runData) {
    for (const nodeName of Object.keys(runData)) {
      const runs = runData[nodeName];
      if (!Array.isArray(runs)) continue;
      for (const run of runs) {
        const out = run?.data?.main?.[0]?.[0]?.json;
        if (out?.lead_id) { leadId = out.lead_id; break; }
      }
      if (leadId) break;
    }
  }
} catch (_) {}

return [{ json: {
  error_id: `err_${Date.now()}`,
  workflow_name: item.workflow?.name || 'unknown',
  node_name: item.execution?.lastNodeExecuted || 'unknown',
  lead_id: leadId,
  timestamp: new Date().toISOString(),
  error_message: item.error?.message || 'Unknown error',
  payload_snapshot: JSON.stringify(item).slice(0, 5000),
  status: 'open'
} }];
