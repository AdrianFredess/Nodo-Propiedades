/**
 * PANEL-01: gate de caché (static data).
 * TTL payload completo 45s · stock 3 min.
 */
const TTL_FULL_MS = 45 * 1000;
const TTL_STOCK_MS = 3 * 60 * 1000;
const sd = $getWorkflowStaticData('global');
const now = Date.now();

const full = sd.fullCache;
const fullAge = full && full.at ? now - full.at : Infinity;
if (full && full.payload && fullAge < TTL_FULL_MS) {
  return [
    {
      json: {
        cacheHit: true,
        needStockRead: false,
        ...full.payload,
        stockSource: 'full-cache',
        generatedAt: new Date().toISOString(),
        warning: full.payload.warning
          ? String(full.payload.warning)
          : undefined,
      },
    },
  ];
}

const stock = sd.stockCache;
const stockAge = stock && stock.at ? now - stock.at : Infinity;
const stockOk =
  stock && Array.isArray(stock.rows) && stockAge < TTL_STOCK_MS;

return [
  {
    json: {
      cacheHit: false,
      needStockRead: !stockOk,
      stockFromCache: stockOk ? stock.rows : [],
      stockCachedAt: stock && stock.at ? stock.at : null,
    },
  },
];
