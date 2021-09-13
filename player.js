const { Gio, GObject, St, Clutter, GLib } = imports.gi;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { Slider } = imports.ui.slider;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { createProxy } = Me.imports.dbus;
const { parseMetadata, stripInstanceNumbers, getRequest } = Me.imports.utils;

const Player = GObject.registerClass(
    class Player extends PanelMenu.Button {
        _init(busName, parent) {
            super._init(0.5, "Media Controls Track Information");

            this.setSensitive(false);

            this.busName = busName;

            this._extension = parent;

            return (async () => {
                try {
                    this._playerProxy = createProxy(
                        "org.mpris.MediaPlayer2.Player",
                        busName,
                        "/org/mpris/MediaPlayer2",
                        Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES
                    );

                    this._otherProxy = createProxy(
                        "org.mpris.MediaPlayer2",
                        busName,
                        "/org/mpris/MediaPlayer2",
                        Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES
                    );

                    [this._playerProxy, this._otherProxy] = await Promise.all([
                        this._playerProxy,
                        this._otherProxy,
                    ]);

                    this._metadata = parseMetadata(this._playerProxy.Metadata);
                    this._status = this._playerProxy.PlaybackStatus;

                    this._playerProxy.connect("g-properties-changed", this._playerPropsChanged.bind(this));
                    this._otherProxy.connect("g-properties-changed", this._otherPropsChanged.bind(this));

                    this._saveImage();
                } catch (error) {
                    logError(error);
                }

                return this;
            })();
        }

        initWidgets() {
            // Title and player icon

            this.iconPlayer = new St.Icon({
                fallback_icon_name: "audio-x-generic",
                icon_name: this.icon,
                style_class: "system-status-icon",
            });
            this.labelTitle = new St.Label({
                text: this.label || "No track",
                style: this.maxWidth,
                y_align: Clutter.ActorAlign.CENTER,
            });

            this.labelSeperatorStart = new St.Label({
                text: this._extension._settings.sepChars[0],
                style: "padding-right: 3px",
                y_align: Clutter.ActorAlign.CENTER,
            });

            this.labelSeperatorEnd = new St.Label({
                text: this._extension._settings.sepChars[1],
                style: "padding-left: 3px",
                y_align: Clutter.ActorAlign.CENTER,
            });

            this.subContainerLabel = new St.BoxLayout();

            // this.subContainerLabel.add_child(this.iconPlayer);
            // this.subContainerLabel.add_child(this.labelSeperatorStart);
            // this.subContainerLabel.add_child(this.labelTitle);
            // this.subContainerLabel.add_child(this.labelSeperatorEnd);

            this.containerButtonLabel = new St.Button({
                style_class: "panel-button",
            });

            this.containerButtonLabel.connect("button-release-event", (widget) => {
                let button = widget.pseudo_class && widget.pseudo_class.includes("active") ? 0 : 1;
                switch (this._extension._settings.mouseActions[button]) {
                    case "toggle_play":
                        this._playerProxy.PlayPauseRemote();
                        break;
                    case "next":
                        this._playerProxy.NextRemote();
                        break;
                    case "previous":
                        this._playerProxy.PreviousRemote();
                        break;
                    case "play":
                        this._playerProxy.PlayRemote();
                        break;
                    case "pause":
                        this._playerProxy.PauseRemote();
                        break;
                    case "toggle_menu":
                        this._extension.menu.toggle(true);
                        this.menu.close(true);
                        break;
                    case "toggle_info":
                        this.menu.toggle(true);
                        this._extension.menu.close(true);
                        break;
                    default:
                        break;
                }
            });

            this.containerButtonLabel.set_child(this.subContainerLabel);

            // Player controls

            this.iconPrev = new St.Icon({
                icon_name: "media-skip-backward-symbolic",
                style_class: "system-status-icon",
            });
            this.iconPlayPause = new St.Icon({
                icon_name: this.isPlaying ? "media-playback-pause-symbolic" : "media-playback-start-symbolic",
                style_class: "system-status-icon",
            });
            this.iconNext = new St.Icon({
                icon_name: "media-skip-forward-symbolic",
                style_class: "system-status-icon",
            });

            this.buttonPrev = new St.Button({
                style_class: "panel-button",
            });
            this.buttonPlayPause = new St.Button({
                style_class: "panel-button",
            });
            this.buttonNext = new St.Button({
                style_class: "panel-button",
            });

            this.buttonPrev.connect("button-release-event", () => {
                this._playerProxy.PreviousRemote();
            });

            this.buttonPlayPause.connect("button-release-event", () => {
                this._playerProxy.PlayPauseRemote();
            });

            this.buttonNext.connect("button-release-event", () => {
                this._playerProxy.NextRemote();
            });

            this.buttonNext.set_child(this.iconNext);
            this.buttonPlayPause.set_child(this.iconPlayPause);
            this.buttonPrev.set_child(this.iconPrev);

            this.containerControls = new St.BoxLayout();

            this.containerControls.add_child(this.buttonPrev);
            this.containerControls.add_child(this.buttonPlayPause);
            this.containerControls.add_child(this.buttonNext);

            this.dummyContainer = new St.BoxLayout();

            this.dummyContainer.add_child(this.containerButtonLabel);
            // this.dummyContainer.add_child(this.containerControls);

            this.add_child(this.dummyContainer);

            this._addInfoMenuItems();

            this._updateLoopIcon();
            this.updateLabelWidths();
            this.updateIconEffects();
        }

        _playerPropsChanged(proxy, changed, invalidated) {
            changed = changed.recursiveUnpack();
            if (changed.Metadata) {
                this._metadata = parseMetadata(changed.Metadata);
                if (this._metadata["title"]) {
                    if (this.hidden) {
                        this._extension.unhidePlayer(this.busName);
                    }
                    this._updateWidgets();
                    this._saveImage();
                } else {
                    this._extension.hidePlayer(this.busName);
                }
            }

            if (changed.PlaybackStatus) {
                this._status = changed.PlaybackStatus;
                this._updateStatusIcons();
            }

            if (changed.LoopStatus) {
                this._updateLoopIcon();
            }
        }

        _otherPropsChanged(proxy, changed, invalidated) {
            changed = changed.recursiveUnpack();
            if (changed.Identity) {
                this.infoMenuPlayerIcon.set_icon_name(this.icon);
                this.iconPlayer.set_icon_name(this.icon);
                this.infoMenuPlayerName.set_text(this.name);
            }
        }

        _updateWidgets() {
            if (this.iconPlayer) {
                this.iconPlayer.set_icon_name(this.icon);
                this.labelTitle.set_text(this.label);

                this._updateStatusIcons();
            }

            if (this._menuItem) {
                log(this._menuIcon, this._menuItem, this._menuLabel);
                this._menuIcon.set_gicon(this.trackIcon);
                this._menuLabel.set_text(this.label);
            }

            if (this._infoItem) {
                this._infoIcon.set_gicon(this.trackIcon);
                this.infoTitleLabel.set_text(this.title);
                this.infoArtistLabel.set_text(this.artist);
            }
        }

        _updateStatusIcons() {
            if (this.iconPlayPause) {
                this.iconPlayPause.set_icon_name(
                    this.isPlaying ? "media-playback-pause-symbolic" : "media-playback-start-symbolic"
                );
            }
            if (this.infoIconPlayPause) {
                this.infoIconPlayPause.set_icon_name(
                    this.isPlaying ? "media-playback-pause-symbolic" : "media-playback-start-symbolic"
                );
            }
        }

        _updateLoopIcon() {
            if (this._playerProxy.LoopStatus) {
                switch (this._playerProxy.LoopStatus) {
                    case "None":
                        this.infoIconLoop.set_icon_name("media-playlist-consecutive-symbolic");
                        break;
                    case "Track":
                        this.infoIconLoop.set_icon_name("media-playlist-repeat-song-symbolic");
                        break;
                    case "Playlist":
                        this.infoIconLoop.set_icon_name("media-playlist-repeat-symbolic");
                        break;
                    default:
                        break;
                }
            } else {
                this.infoItemContainer.remove_child(this.infoButtonLoop);
            }
        }

        updateLabelWidths() {
            this.labelTitle.set_style(this.maxWidth);
            this._menuLabel.set_style(this.maxWidth);
            this.infoArtistLabel.set_style(this.maxWidth);
            this.infoTitleLabel.set_style(`font-size: large; ${this.maxWidth}`);
        }

        updateIconEffects() {
            if (this._extension._settings.coloredPlayerIcon) {
                this.iconPlayer.clear_effects();
                this.iconPlayer.set_style("-st-icon-style: requested");
                this.iconPlayer.set_fallback_icon_name("audio-x-generic");

                this.infoMenuPlayerIcon.clear_effects();
                this.infoMenuPlayerIcon.set_style("-st-icon-style: requested; padding-right: 6px;");
                this.infoMenuPlayerIcon.set_fallback_icon_name("audio-x-generic");
            } else {
                this.iconPlayer.set_style("-st-icon-style: symbolic");
                this.iconPlayer.add_effect(new Clutter.DesaturateEffect());
                this.iconPlayer.set_fallback_icon_name("audio-x-generic-symbolic");

                this.infoMenuPlayerIcon.set_style("-st-icon-style: symbolic;  padding-right: 6px;");
                this.infoMenuPlayerIcon.add_effect(new Clutter.DesaturateEffect());
                this.infoMenuPlayerIcon.set_fallback_icon_name("audio-x-generic-symbolic");
            }
        }

        _addInfoMenuItems() {
            if (!this._infoItem) {
                this._infoItem = new PopupMenu.PopupBaseMenuItem();
                this._infoItem.set_track_hover(false);

                this.infoItemContainer = new St.BoxLayout({
                    vertical: true,
                    x_expand: true,
                });

                // Player icon and name

                const playerIconLabelContainer = new St.BoxLayout({
                    x_align: Clutter.ActorAlign.CENTER,
                    // style: "padding-bottom: 10px;",
                    reactive: false,
                });

                this.infoMenuPlayerIcon = new St.Icon({
                    icon_name: this.icon,
                    fallback_icon_name: "audio-x-generic-symbolic",
                    style_class: "popup-menu-icon",
                    style: "padding-right:6px;",
                    y_align: Clutter.ActorAlign.CENTER,
                });

                playerIconLabelContainer.add(this.infoMenuPlayerIcon);

                this.infoMenuPlayerName = new St.Label({
                    text: this._otherProxy.Identity,
                    y_align: Clutter.ActorAlign.CENTER,
                    style: "font-size: small;",
                });

                playerIconLabelContainer.add(this.infoMenuPlayerName);

                this.infoItemContainer.add(playerIconLabelContainer);

                // const nameSep = ;
                this.infoItemContainer.add(new PopupMenu.PopupSeparatorMenuItem());

                // Album art

                this._infoIcon = new St.Icon({
                    x_expand: true,
                    gicon: this.trackIcon,
                });

                this._infoIcon.set_width(100);

                this.infoItemContainer.add(this._infoIcon);

                // Track title and artist

                this.infoTitleLabel = new St.Label({
                    text: this.title,
                    x_align: Clutter.ActorAlign.CENTER,
                    style: "font-size: large;",
                });

                this.infoArtistLabel = new St.Label({
                    text: this.artist || "",
                    x_align: Clutter.ActorAlign.CENTER,
                });

                this.infoItemContainer.add(this.infoTitleLabel);
                this.infoItemContainer.add(this.infoArtistLabel);

                // Controls

                this.infoIconLoop = new St.Icon({
                    icon_name: "media-playlist-repeat-symbolic",
                    style_class: "popup-menu-icon",
                });

                this.infoButtonLoop = new St.Button({
                    x_align: Clutter.ActorAlign.START,

                    style_class: "popup-menu-button",
                });

                this.infoButtonLoop.connect("button-press-event", this._changeLoop.bind(this));

                this.infoButtonLoop.set_child(this.infoIconLoop);

                this.infoItemContainer.add(this.infoButtonLoop);

                // Play/pause button

                const mainControlButtons = new St.BoxLayout({
                    x_align: Clutter.ActorAlign.CENTER,
                });

                this.infoIconPlayPause = new St.Icon({
                    icon_name: this.isPlaying
                        ? "media-playback-pause-symbolic"
                        : "media-playback-start-symbolic",
                    style_class: "popup-menu-icon",
                });

                const buttonPlayPause = new St.Button({
                    style_class: "message-icon",
                    style_class: "popup-menu-button",
                });

                buttonPlayPause.connect("button-press-event", () => {
                    this._playerProxy.PlayPauseRemote();
                });

                buttonPlayPause.set_child(this.infoIconPlayPause);

                const buttonPrev = new St.Button({
                    style_class: "popup-menu-button",
                });

                buttonPrev.connect("button-press-event", () => {
                    this._playerProxy.PreviousRemote();
                });

                buttonPrev.set_child(
                    new St.Icon({
                        icon_name: "media-skip-backward-symbolic",
                        style_class: "popup-menu-icon",
                    })
                );

                const buttonNext = new St.Button({
                    style_class: "popup-menu-button",
                });

                buttonNext.connect("button-press-event", () => {
                    this._playerProxy.NextRemote();
                });

                buttonNext.set_child(
                    new St.Icon({
                        icon_name: "media-skip-forward-symbolic",
                        style_class: "popup-menu-icon",
                    })
                );

                mainControlButtons.add(buttonPrev);
                mainControlButtons.add(buttonPlayPause);
                mainControlButtons.add(buttonNext);

                this.infoItemContainer.add(mainControlButtons);

                this._infoItem.add(this.infoItemContainer);

                this.menu.addMenuItem(this._infoItem);
            }
        }

        _changeLoop() {
            switch (this._playerProxy.LoopStatus) {
                case "None":
                    this._playerProxy.LoopStatus = "Track";
                    break;
                case "Track":
                    this._playerProxy.LoopStatus = "Playlist";
                    break;
                case "Playlist":
                    this._playerProxy.LoopStatus = "None";
                    break;
            }
            // this._updateLoopIcon();
        }

        async _saveImage() {
            try {
                const regexp = new RegExp(
                    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
                );

                if (regexp.test(this.image)) {
                    const destination = GLib.build_filenamev([
                        this._extension.dataDir,
                        "media-controls",
                        "cache",
                        GLib.base64_encode(this.id),
                    ]);
                    const cacheFile = Gio.File.new_for_path(destination);
                    if (!cacheFile.query_exists(null)) {
                        const remoteIcon = await getRequest(this.image);
                        if (GLib.mkdir_with_parents(cacheFile.get_parent().get_path(), 0o744) === 0) {
                            let [success, tag] = cacheFile.replace_contents(
                                remoteIcon,
                                null,
                                false,
                                Gio.FileCreateFlags.REPLACE_DESTINATION,
                                null
                            );

                            if (!success) {
                                throw new Error("Failed to save icon.");
                            }
                        } else {
                            throw new Error("Failed to save icon.");
                        }
                    }
                }
            } catch (error) {
                logError(error);
            }
        }

        _getImage() {
            try {
                let destination = GLib.build_filenamev([
                    this._extension.dataDir,
                    "media-controls",
                    "cache",
                    GLib.base64_encode(this.id),
                ]);
                let cacheFile = Gio.File.new_for_path(destination);
                let [success, contents] = cacheFile.load_contents(null);
                if (success) {
                    return Gio.BytesIcon.new(contents);
                } else {
                    return null;
                }
            } catch (error) {
                if (
                    error.toString().includes("Expected type") ||
                    error.toString().includes("Error opening file")
                ) {
                    log("Failed to retrieve icon.");
                } else {
                    logError(error);
                }
                return null;
            }
        }

        destroy() {
            super.destroy();
        }

        get menuItem() {
            if (!this._menuItem) {
                this._menuItem = new PopupMenu.PopupBaseMenuItem();

                this._menuIcon = new St.Icon({
                    gicon: this.trackIcon,
                    y_align: Clutter.ActorAlign.CENTER,
                    style_class: "popup-menu-icon",
                });

                this._menuLabel = new St.Label({
                    text: this.label,
                    y_align: Clutter.ActorAlign.CENTER,
                });

                this._menuItem.busName = this.busName;

                this._menuItem.add(this._menuIcon);
                this._menuItem.add(this._menuLabel);
            }

            return this._menuItem;
        }

        get trackIcon() {
            return this._getImage() || Gio.icon_new_for_string(this.image || "audio-x-generic-symbolic");
        }

        get isPlaying() {
            return this._status === "Playing";
        }

        get maxWidth() {
            let maxWidth = this._extension._settings.maxDisplayWidth;

            if (maxWidth !== 0) {
                maxWidth = `max-width: ${maxWidth}px;`;
            } else {
                maxWidth = "max-width: none;";
            }

            return maxWidth;
        }

        get icon() {
            return this.name.toLowerCase();
        }

        get label() {
            let labelWithArtist = this.title;

            if (this.artist !== "Unknown artist") {
                labelWithArtist += ` - ${this.artist}`;
            }

            return labelWithArtist;
        }

        get name() {
            if (!this._strippedName) {
                this._strippedName = stripInstanceNumbers(this.busName).replace(
                    "org.mpris.MediaPlayer2.",
                    ""
                );
                this._strippedName =
                    this._strippedName.charAt(0).toUpperCase() + this._strippedName.substr(1);
            }

            return this._otherProxy.Identity || this._strippedName;
        }

        get title() {
            return this._metadata["title"] || "No track";
        }

        get artist() {
            let artist = this._metadata["artist"];
            return (Array.isArray(artist) ? artist.join(", ") : artist) || "Unknown artist";
        }

        get image() {
            return this._metadata["image"];
        }

        get id() {
            return this._metadata["id"];
        }
    }
);
