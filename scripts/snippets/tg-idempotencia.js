const item = $input.first().json || {};
const updateId = Number(item.update_id || 0);
const sd = $getWorkflowStaticData('global');
const last = Number(sd.lastUpdateId || 0);
if (updateId && last && updateId <= last) return [];
if (updateId) sd.lastUpdateId = updateId;
return [{ json: item }];
