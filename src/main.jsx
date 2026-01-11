import './index.css';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// import DataStandardizer from "./components/DataStandardizer.jsx"; // You can keep this or comment it out

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />  {/* ✅ This must be active */}
    {/* <DataStandardizer /> */} {/* ❌ This must be commented out */}
  </React.StrictMode>
);