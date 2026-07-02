const item = $('Google Sheets - Lookup Lead').first().json;
const interactions = $input.all().map(i => i.json).filter(i => i.lead_id);

const history = interactions
  .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
  .slice(0, 5)
  .map(i => ({
    direction: i.direction,
    channel: i.channel,
    message: i.message_raw || i.message_sent || '',
    timestamp: i.timestamp
  }));

return [{ json: {
  ...item,
  history_context: history,
  matched_properties_summary: []
} }];
