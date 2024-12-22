type FeatureFlag = `feature.${string}`;

export const isFeatureEnabled = (feature: FeatureFlag) => {
  return typeof window !== "undefined" && window.localStorage.getItem(feature);
};
