const express = require("express");
const createError = require("http-errors");
const morgan = require("morgan");
require("dotenv").config();
const cron = require("node-cron");
const integrationService = require("./services/integration_service"); 
const orderSyncService = require("./services/order-sync-service");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

app.use("/api", require("./routes/api.route")); 

app.use((req, res, next) => {
  next(createError.NotFound());
});
require("dotenv").config();
app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.send({
    status: err.status || 500,
    message: err.message,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server running in port:${PORT}`);

  await integrationService.initializeCheckpoint();

  cron.schedule("0 */2 * * *", async () => {
      console.log("[CRON] Executing scheduled sync...");
      await integrationService.runSyncCycle();
      console.log("[CRON] Starting Order Sync...");
      await orderSyncService.runOrderSync();
      console.log("[CRON] All cycles completed.");
  });
});