'use strict';

const MAX_ADIF_RECORDS = 500_000;
const MAX_ADIF_VALUE_LENGTH = 25 * 1024 * 1024;
const MAX_TAG_HEADER_LENGTH = 256;
const MAX_FIELD_NAME_LENGTH = 64;

function validFieldName(name) {
  if (!name || name.length > MAX_FIELD_NAME_LENGTH) return false;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    if (!isDigit && !isUpper && code !== 95) return false;
  }
  return true;
}

function parseLength(text) {
  if (!text) return null;
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) return null;
    value = value * 10 + (code - 48);
    if (value > MAX_ADIF_VALUE_LENGTH) return null;
  }
  return value;
}

function parseAdif(text) {
  const input = String(text);
  const records = [];
  let record = {};
  let hasFields = false;
  let cursor = 0;

  const finishRecord = () => {
    if (!hasFields) return;
    records.push(record);
    if (records.length > MAX_ADIF_RECORDS) throw new Error('ADIF contains too many records.');
    record = {};
    hasFields = false;
  };

  while (cursor < input.length) {
    const open = input.indexOf('<', cursor);
    if (open < 0) break;
    const close = input.indexOf('>', open + 1);
    if (close < 0) break;

    cursor = close + 1;
    if (close - open - 1 > MAX_TAG_HEADER_LENGTH) continue;

    const header = input.slice(open + 1, close).toUpperCase();
    if (header === 'EOR') {
      finishRecord();
      continue;
    }
    if (header === 'EOH') {
      record = {};
      hasFields = false;
      continue;
    }

    const firstColon = header.indexOf(':');
    if (firstColon <= 0) continue;
    const secondColon = header.indexOf(':', firstColon + 1);
    const name = header.slice(0, firstColon);
    const lengthText = header.slice(firstColon + 1, secondColon < 0 ? header.length : secondColon);
    if (!validFieldName(name)) continue;

    const declaredLength = parseLength(lengthText);
    if (declaredLength === null) continue;

    const valueStart = close + 1;
    const available = input.length - valueStart;
    const actualLength = Math.min(declaredLength, available);
    record[name] = input.slice(valueStart, valueStart + actualLength).trim();
    hasFields = true;
    cursor = valueStart + actualLength;
  }

  finishRecord();
  return records;
}

module.exports = { parseAdif };
