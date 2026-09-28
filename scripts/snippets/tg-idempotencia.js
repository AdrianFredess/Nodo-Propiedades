const item = $input.first().json || {};
const updateId = Number(item.update_id || 0);
const sd = $getWorkflowStaticData('global');
if (!Array.isArray(sd.seenUpdateIds)) sd.seenUpdateIds = [];
if (updateId && sd.seenUpdateIds.indexOf(updateId) >= 0) return [];
if (updateId) {
  sd.seenUpdateIds.push(updateId);
  if (sd.seenUpdateIds.length > 200) sd.seenUpdateIds = sd.seenUpdateIds.slice(-200);
}
return [{ json: item }];
