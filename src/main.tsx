import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import Journal from "./pages/Journal";
import Analytics from "./pages/Analytics";
import ImportExport from "./pages/ImportExport";
import Settings from "./pages/Settings";
import { init } from "@/services/store";
import "./index.css";

void init();

// GitHub Pages deep-link support: public/404.html bounces 404s to "/?/<path>",
// here we translate that back into a real client route.
if (window.location.search.startsWith("?/")) {
  const real = window.location.search.slice(2) + window.location.hash;
  window.history.replaceState(null, "", real || "/");
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "journal", element: <Journal /> },
      { path: "analytics", element: <Analytics /> },
      { path: "import-export", element: <ImportExport /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
