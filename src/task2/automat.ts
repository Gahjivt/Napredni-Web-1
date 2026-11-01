import { writeFile } from "node:fs/promises";

export async function getToken(
  authority: string,
  audience: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<string> {
  const res = await fetch(`${authority}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
      scope
    })
  });
  if (!res.ok) throw new Error(`Greška ${res.status}`);
  return (await res.json()).access_token;
}

export async function issuePass(
  url: string,
  token: string,
  name: string,
  document: string
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, document })
  });
  if (!res.ok) throw new Error(`Greška ${res.status}`);
  const id = res.headers.get("Location")!.split("/").pop();
  await writeFile(`${id}.png`, Buffer.from(await res.arrayBuffer()));
}