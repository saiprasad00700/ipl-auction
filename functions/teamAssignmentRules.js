// Keep franchise selection available in both pre-auction lobby states.
export function canChangeFranchise(status) {
  return status === undefined || status === null || status === "" || status === "waiting" || status === "lobby";
}
