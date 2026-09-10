export default {
  event: "error",
  handler: (payload) => console.error("socket error:", JSON.stringify(payload)),
};
