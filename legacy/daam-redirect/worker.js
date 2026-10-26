// The project was called Daam until 2026-10-27; this keeps every old link working.
// Pages and GETs move permanently (301); anything else keeps its method (308).
const TARGET = 'https://britto.amitynoidalibrary.workers.dev';

export default {
  fetch(request) {
    const url = new URL(request.url);
    const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
    return Response.redirect(TARGET + url.pathname + url.search, status);
  },
};
