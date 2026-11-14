/* api.js
   Every request to the server goes through this file.
   Pages never call fetch() directly, so in the backend phase
   only BASE_URL (and maybe a token header) has to change. */

const BASE_URL = "http://localhost:3000";

async function request(path, method = "GET", body) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) options.body = JSON.stringify(body);

  let response;
  try {
    response = await fetch(BASE_URL + path, options);
  } catch (error) {
    throw new Error("Cannot reach the API. Start it with: npm start");
  }
  if (!response.ok) {
    throw new Error("Server error " + response.status + " on " + method + " " + path);
  }
  return response.json();
}

/* Turns { zoneId: 1, id: [3, 4] } into "?zoneId=1&id=3&id=4" */
function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    [].concat(value).forEach((item) => search.append(key, item));
  }
  const text = search.toString();
  return text ? "?" + text : "";
}

const api = {
  list: (resource, params) => request("/" + resource + toQuery(params)),
  get: (resource, id) => request("/" + resource + "/" + id),
  create: (resource, data) => request("/" + resource, "POST", data),
  update: (resource, id, changes) => request("/" + resource + "/" + id, "PATCH", changes),
  remove: (resource, id) => request("/" + resource + "/" + id, "DELETE"),

  getSettings: () => request("/settings"),
  updateSettings: (changes) => request("/settings", "PATCH", changes),

  /* Status changes: read the record again first, and only continue if it is
     still in one of the allowed statuses. This stops an action on a record
     that someone else changed after the page was loaded. */
  async transition(resource, id, allowedStatuses, changes) {
    const fresh = await api.get(resource, id);
    if (!allowedStatuses.includes(fresh.status)) {
      throw new Error("This record has changed (now " + fresh.status + "). Please refresh the page.");
    }
    return api.update(resource, id, changes);
  },
};
