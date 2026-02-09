import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";

Sentry.init({
  dsn: "https://e0d21a59fd0857615b5b6f58e9c6af25@o4510857759817728.ingest.de.sentry.io/4510857776005200",
  integrations: [new BrowserTracing()],
  tracesSampleRate: 1.0, // لتتبع الأداء (0 إلى 1)
  environment: process.env.NODE_ENV || 'development', // development أو production
});

export default Sentry;