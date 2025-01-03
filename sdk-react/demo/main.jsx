import React from "react";
import ReactDOM from "react-dom/client";
import { TestPage } from "./TestPage";

const insecureClusterAuth = {
  authType: "cluster",
  clusterId: "01JGFZ1E1HJGBA4893P5WE7P6Q",
  apiSecret: "sk_yyGmpQtEkVv5WOrrZ9ukvjr0Ub1lj2anrC6bhksHVw",
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <TestPage baseUrl="http://localhost:4000" {...insecureClusterAuth} />
);
