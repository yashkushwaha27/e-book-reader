import moment from "moment";

/** e.g. "April 10 at 6:50 PM" */
export function formatRecentReadTime(readAtMs: number): string {
  return moment(readAtMs).format("MMMM D [at] h:mm A");
}
