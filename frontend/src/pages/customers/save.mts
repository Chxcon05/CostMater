import { getAuthHeaders, API_URL, closeModal, load } from "./index.astro.0.mjs";

export async function save() {
const headers = getAuthHeaders();
if (!headers) return;

const recordIdInput = document.getElementById("record-id") as HTMLInputElement | null;
const id = recordIdInput?.value || "";

const fields = [
"name",
"email",
"phone",
"address",
"city",
"state",
"postal_code",
"credit_limit",
"payment_days",
"notes",
"country",
];
const body = {};
fields.forEach((f) => {
const val = document.getElementById(f).value;
body[f] =
val !== ""
? val
: f === "credit_limit" || f === "payment_days"
? 0
: "";
});

try {
console.log("Saving customer:", body);
const res = await fetch(`${API_URL}/customers${id ? "/" + id : ""}`, {
method: id ? "PUT" : "POST",
headers: { ...headers, "Content-Type": "application/json" },
body: JSON.stringify(body),
});

if (res.ok) {
closeModal();
load();
} else {
const error = await res.json();
console.error("Save error:", error);
alert("Error al guardar: " + (error.error || "Desconocido"));
}
} catch (e) {
console.error("Save error:", e);
alert("Error al guardar");
}
}
