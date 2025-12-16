import { json } from "react-router";

export function loader() {
  return json({ status: "ok" });
}
