const express = require("express");
const { exec } = require("child_process");
const app = express();
const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

function getBatteryInfo() {
  //   return new Promise((resolve, reject) => {
  //     resolve({ percentage: 20, batteryState: "discharging" });
  //   });
  return new Promise((resolve, reject) => {
    exec(
      "upower -i /org/freedesktop/UPower/devices/battery_BAT1",
      (error, stdout, stderr) => {
        if (error) {
          reject(`Error executing command: ${error.message}`);
          return;
        }
        if (stderr) {
          reject(`Command error: ${stderr}`);
          return;
        }

        // Parse the output
        const lines = stdout.split("\n"); // Split output into lines
        let percentage = 0;
        let batteryState = "discharging";

        lines.forEach((line) => {
          // Split by ":" to get key-value pairs
          const [key, value] = line.split(":").map((part) => part.trim());

          if (key === "percentage") {
            percentage = parseInt(value.replace("%", ""));
          }
          if (key === "state") {
            batteryState = value;
          }
        });

        resolve({ percentage, batteryState });
      }
    );
  });
}

const INTERVAL = 1000 * 60 * 5;
// const INTERVAL = 1000 * 5;

async function sendGotifyNotification({ title, message, priority }) {
  //   console.log(process.env.DEVICE_TOKEN);
  const formData = new FormData();
  formData.append("title", title);
  formData.append("message", message);
  formData.append("priority", priority);

  try {
    const response = await axios.post(
      `${process.env.GOTIFY_URL}/message?token=${process.env.DEVICE_TOKEN}`,
      formData
    );
  } catch (error) {
    console.log("Error sending notification:", error);
  }
}

app.get("/battery-stats", async (req, res) => {
  const batteryStats = await getBatteryInfo();
  if (batteryStats)
    return res.status(200).send({ success: true, data: batteryStats });
  return res
    .status(500)
    .send({ success: false, error: "Something went wrong" });
});

setInterval(() => {
  getBatteryInfo()
    .then(async (info) => {
      console.log(info);
      const currentHour = new Date().getHours();
      if (currentHour >= 23 || currentHour <= 10) {
        if (info.batteryState === "discharging") {
          await sendGotifyNotification({
            title: `Night Charging: percent: ${info.percentage}%`,
            message: "Turn on the charging for night.",
            priority: 2,
          });
          return;
        }
        return;
      } else {
        if (info.percentage <= 35 && info.batteryState === "discharging") {
          await sendGotifyNotification({
            title: `Battery is low: ${info.percentage}%`,
            message: "Low battery, turn on the power to avoid shutdown.",
            priority: 1,
          });
          return;
        }
        if (info.percentage >= 85 && info.batteryState === "charging") {
          await sendGotifyNotification({
            title: `Battery is enough: ${info.percentage}%`,
            message: "Turn off the charging to avoid battery life issue",
            priority: 3,
          });
          return;
        }
      }
    })

    .catch((error) => console.error(error));
}, INTERVAL);

const port = 4210;
app.listen(port, () => console.log(`Listening on ${port}...`));
