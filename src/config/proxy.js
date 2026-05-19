function getTrustProxySetting() {
  const rawValue = process.env.TRUST_PROXY;

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 1;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
    return false;
  }

  if (normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }

  const numericValue = Number.parseInt(normalized, 10);
  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  return rawValue;
}

module.exports = {
  getTrustProxySetting
};
