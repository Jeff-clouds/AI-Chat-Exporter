export const FEATURES = {
    outline_navigation: 'free',
    full_markdown_export: 'free',
    selected_markdown_export: 'pro'
};

export function isProFeature(feature) {
    return FEATURES[feature] === 'pro';
}
