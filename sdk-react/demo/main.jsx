import React from "react";
import ReactDOM from "react-dom/client";
import { TestPage } from "./TestPage";

const clusterSettings = {
  authType: "cluster",
  clusterId: "",
  apiSecret: "",
};

const { clusterId, apiSecret } = clusterSettings;

ReactDOM.createRoot(document.getElementById("root")).render(
  !clusterId || !apiSecret ? (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <p>
        Please set clusterId and apiSecret. If you don't have a cluster, please create a free
        account at <a href="https://app.inferable.ai">https://app.inferable.ai</a>
      </p>
    </div>
  ) : (
    <TestPage baseUrl="https://api.inferable.ai" {...clusterSettings} />
  )
);
