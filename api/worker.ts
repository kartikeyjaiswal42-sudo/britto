// Worker entry. Only the default export lives here: workerd treats every named export of
// the main module as an entrypoint and refuses plain values (workspace gotcha, bookbot).
import { handler } from './app.ts';

export default handler;
