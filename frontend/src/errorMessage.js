function flattenErrorMessages(value) {
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(flattenErrorMessages);
  if (!value || typeof value !== "object") return [];
  if (typeof value.message === "string") return [value.message];

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const messages = flattenErrorMessages(nestedValue);
    if (key === "detail" || key === "non_field_errors") return messages;
    return messages.map((message) => `${key}: ${message}`);
  });
}

export function getApiErrorMessage(error, fallback) {
  const messages = flattenErrorMessages(error?.response?.data);
  return messages.length ? [...new Set(messages)].join(" ") : fallback;
}
