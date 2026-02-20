// Native Date used instead of moment

function formatDateTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
}

function formatDuration(seconds) {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function getPlatformIcon(platform) {
    switch (platform?.toLowerCase()) {
        case 'youtube': return 'brand-youtube';
        case 'twitch': return 'brand-twitch';
        case 'facebook': return 'brand-facebook';
        default: return 'movie';
    }
}

function getPlatformColor(platform) {
    switch (platform?.toLowerCase()) {
        case 'youtube': return 'red-600';
        case 'twitch': return 'purple-600';
        case 'facebook': return 'blue-600';
        default: return 'gray-600';
    }
}

function getAvatar(req) {
    if (req && req.session && req.session.avatar_path) {
        return `<img src="${req.session.avatar_path}" alt="Avatar" class="h-8 w-8 rounded-full">`;
    }
    return `<div class="h-8 w-8 rounded-full bg-gray-500 flex items-center justify-center text-white">?</div>`;
}

function getUsername(req) {
    if (req && req.session && req.session.username) {
        return req.session.username;
    }
    return 'Guest';
}

module.exports = {
    formatDateTime,
    formatDuration,
    getPlatformIcon,
    getPlatformColor,
    getAvatar,
    getUsername
};
