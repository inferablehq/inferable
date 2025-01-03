import React from "react";
import ReactDOM from "react-dom/client";
import { TestPage } from "./TestPage";

const insecureClusterAuth = {
  authType: "cluster",
  clusterId: "",
  apiSecret: "",
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <TestPage baseUrl="https://api.inferable.ai" {...insecureClusterAuth} />
);
