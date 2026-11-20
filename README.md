# AudioRecordingFM
 

## Configuration

Copy `.env.example` to `.env` and set the credentials and other values for your installation. Existing deployments migrating from `config.json` must transfer their MongoDB, MySQL, FTP, mailer, session secret (`JWT_SECRET`), and radio URL values to the corresponding variables in `.env.example` or to their hosting environment. The application no longer reads `config.json`.

Environment variables supplied by the host take precedence over `.env`. The stream health checker updates `RADIO_PRIME_URL` in `.env` when it repairs the stream and applies the new URL immediately. If the host supplies `RADIO_PRIME_URL`, update that hosted variable as well for the repair to survive a restart. A read-only or ephemeral `.env` also prevents durable local persistence.
