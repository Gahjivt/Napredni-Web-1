import { getToken, issuePass } from "./src/task2/automat.ts";

const token = await getToken(
  "https://dev-1cx8n4rdnv1tkq25.us.auth0.com",
  "https://lab1-api",
  "M2M TOKEN",
  "M2M SECRET",
  "create:passes"
);
await issuePass("https://weblabos1-paku.onrender.com/passes", token, "Pero Peric", "HR-123456789");