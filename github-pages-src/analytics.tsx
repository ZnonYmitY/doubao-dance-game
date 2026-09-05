import { createRoot } from "react-dom/client";
import AnalyticsPage from "../app/analytics/page";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("Missing analytics root");

createRoot(root).render(<AnalyticsPage />);
