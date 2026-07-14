export const FEATURES = {
    outline_navigation: 'free',
    full_markdown_export: 'free',
    selected_markdown_export: 'pro',
    additional_export_formats: 'pro'
};

export function isProFeature(feature) {
    return FEATURES[feature] === 'pro';
}

export function getFeaturesForPlan(plan = 'free') {
    return Object.keys(FEATURES).filter(feature => (
        FEATURES[feature] === 'free' || plan === 'pro'
    ));
}
