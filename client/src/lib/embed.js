const params = new URLSearchParams(window.location.search);
export const isEmbed = params.get('embed') === '1';
