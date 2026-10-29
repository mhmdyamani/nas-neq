import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const http = axios.create({ baseURL: API });

export const imgUrl = (p) => (p ? `${API}/images/${p}` : null);

export const peso = (n) =>
  n == null
    ? "Price to be confirmed"
    : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.message) return d.message;
  if (Array.isArray(d)) return d.map((x) => String(x.msg).replace("Value error, ", "")).join(", ");
  if (!e?.response) return "Network problem — please check your connection and try again.";
  return "Something went wrong. Please try again.";
};

export const SERVICE_LABELS = {
  pickup: "In-store pickup",
  dine_in: "Dine-in",
  takeout: "Takeout",
  delivery: "Delivery",
  contactless: "Contactless delivery",
};

export const STATUS_LABELS = {
  pending: "Pending review",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const PAY_LABELS = { pending: "Payment pending", paid: "Paid", failed: "Payment failed", refunded: "Refunded" };

export const BUSINESS = {
  address: "66 Libyan St., Culiat, Quezon City, Philippines",
  phone: "0953 613 5684",
  tel: "+639536135684",
  facebook: "https://web.facebook.com/profile.php?id=100094607904757",
};

export const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

export const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
