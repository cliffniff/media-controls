const ExtensionUtils = imports.misc.extensionUtils;

class Settings {
    constructor(parent) {
        this._settings = ExtensionUtils.getSettings();
        this._extension = parent;

        this.connectSignals();

        this.maxWidgetWidth = this._settings.get_int("max-widget-width");
        this.updateDelay = this._settings.get_int("update-delay");
        this.showTrackName = this._settings.get_boolean("show-text");
        this.showPlayerIcon = this._settings.get_boolean("show-player-icon");
        this.showControls = this._settings.get_boolean("show-control-icons");
        this.showSeperators = this._settings.get_boolean("show-seperators");
        this.showMenu = this._settings.get_boolean("show-sources-menu");
        this.showPlayPauseButton = this._settings.get_boolean("show-playpause-icon");
        this.showPrevButton = this._settings.get_boolean("show-prev-icon");
        this.showNextButton = this._settings.get_boolean("show-next-icon");
        this.extensionPosition = this._settings.get_string("extension-position");
        this.extensionIndex = this._settings.get_int("extension-index");
        this.coloredPlayerIcon = this._settings.get_boolean("colored-player-icon");
        this.mouseActions = this._settings.get_strv("mouse-actions");
        this.sepChars = this._settings.get_strv("seperator-chars");
        this.elementOrder = this._settings.get_strv("element-order");
        this.trackLabel = this._settings.get_strv("track-label");
        this.cacheImages = this._settings.get_boolean("cache-images");
        this.blacklistApps = this._settings.get_strv("backlist-apps");
    }

    connectSignals() {
        this._onMaxWidgetWidthChanged = this._settings.connect("changed::max-widget-width", () => {
            this.maxWidgetWidth = this._settings.get_int("max-widget-width");
            this._extension.player.updateWidgetWidths();
        });

        this._onUpdateDelayChanged = this._settings.connect("changed::update-delay", () => {
            this.updateDelay = this._settings.get_int("update-delay");
        });

        this._onShowTrackNameChanged = this._settings.connect("changed::show-text", () => {
            this.showTrackName = this._settings.get_boolean("show-text");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onShowPlayerIconChanged = this._settings.connect("changed::show-player-icon", () => {
            this.showPlayerIcon = this._settings.get_boolean("show-player-icon");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onShowControlsChanged = this._settings.connect("changed::show-control-icons", () => {
            this.showControls = this._settings.get_boolean("show-control-icons");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onShowSeperatorsChanged = this._settings.connect("changed::show-seperators", () => {
            this.showSeperators = this._settings.get_boolean("show-seperators");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onShowPlayPauseButtonChanged = this._settings.connect("changed::show-playpause-icon", () => {
            this.showPlayPauseButton = this._settings.get_boolean("show-playpause-icon");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });
        this._onShowPrevButtonChanged = this._settings.connect("changed::show-prev-icon", () => {
            this.showPrevButton = this._settings.get_boolean("show-prev-icon");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });
        this._onShowNextButtonChanged = this._settings.connect("changed::show-next-icon", () => {
            this.showNextButton = this._settings.get_boolean("show-next-icon");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onShowMenuChanged = this._settings.connect("changed::show-sources-menu", () => {
            this.showMenu = this._settings.get_boolean("show-sources-menu");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onExtensionPositionChanged = this._settings.connect("changed::extension-position", () => {
            this._extension.removeWidgets();
            this.extensionPosition = this._settings.get_string("extension-position");
            this._extension.addWidgets();
        });

        this._onExtensionIndexChanged = this._settings.connect("changed::extension-index", () => {
            this.extensionIndex = this._settings.get_int("extension-index");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onColoredPlayerIconChanged = this._settings.connect("changed::colored-player-icon", () => {
            this.coloredPlayerIcon = this._settings.get_boolean("colored-player-icon");
            this._extension.player.updateIconEffects();
        });

        this._onSepCharsChanged = this._settings.connect("changed::seperator-chars", () => {
            this.sepChars = this._settings.get_strv("seperator-chars");
            this._extension.player.labelSeperatorStart.set_text(this.sepChars[0]);
            this._extension.player.labelSeperatorEnd.set_text(this.sepChars[1]);
        });

        this._onMouseActionsChanged = this._settings.connect("changed::mouse-actions", () => {
            this.mouseActions = this._settings.get_strv("mouse-actions");
        });

        this._onElementOrderChanged = this._settings.connect("changed::element-order", () => {
            this.elementOrder = this._settings.get_strv("element-order");
            this._extension.removeWidgets();
            this._extension.addWidgets();
        });

        this._onTrackLabelChanged = this._settings.connect("changed::track-label", () => {
            this.trackLabel = this._settings.get_strv("track-label");
            this._extension.player.updateWidgets();
        });

        this._onCacheImagesChanged = this._settings.connect("changed::cache-images", () => {
            this.cacheImages = this._settings.get_boolean("cache-images");
        });

        this._onBacklistAppsChanged = this._settings.connect("changed::backlist-apps", () => {
            this.blacklistApps = this._settings.get_strv("backlist-apps");
        });
    }

    disconnectSignals() {
        this._settings.disconnect(this._onMaxWidgetWidthChanged);
        this._settings.disconnect(this._onUpdateDelayChanged);
        this._settings.disconnect(this._onShowControlsChanged);
        this._settings.disconnect(this._onShowPlayerIconChanged);
        this._settings.disconnect(this._onShowTrackNameChanged);
        this._settings.disconnect(this._onShowSeperatorsChanged);
        this._settings.disconnect(this._onExtensionPositionChanged);
        this._settings.disconnect(this._onShowPlayPauseButtonChanged);
        this._settings.disconnect(this._onShowNextButtonChanged);
        this._settings.disconnect(this._onShowPrevButtonChanged);
        this._settings.disconnect(this._onExtensionIndexChanged);
        this._settings.disconnect(this._onShowSourcesInInfoMenuChanged);
        this._settings.disconnect(this._onColoredPlayerIconChanged);
        this._settings.disconnect(this._onMouseActionsChanged);
        this._settings.disconnect(this._onSepCharsChanged);
        this._settings.disconnect(this._onElementOrderChanged);
        this._settings.disconnect(this._onTrackLabelChanged);
        this._settings.disconnect(this._onCacheImagesChanged);
        this._settings.disconnect(this._onBacklistAppsChanged);
    }
}
