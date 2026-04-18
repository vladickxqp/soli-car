import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`Soli Car backend listening on http://localhost:${port}`);
});
