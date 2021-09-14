/**
 * Main entry point of the extension
 * Contains the main class of the extension
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { createProxy } = Me.imports.dbus;
const { Player } = Me.imports.player;
const { Settings } = Me.imports.settings;

const { GObject, Gio, St, GLib, Clutter } = imports.gi;

const Main = imports.ui.main;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const MediaControls = GObject.registerClass(
    class MediaControls extends PanelMenu.Button {
        _init() {
            super._init(0.5, "Media Controls Extension");
            this.setSensitive(false);

            this.isFixedPlayer = false;
            this._players = {};

            this.dataDir = GLib.get_user_config_dir();
        }

        enable() {
            this.settings = new Settings(this);

            let mouseActions = this.settings.mouseActions;
            let defaultMouseActions = this.settings._settings
                .get_default_value("mouse-actions")
                .recursiveUnpack();

            defaultMouseActions.forEach((action, index) => {
                if (!mouseActions[index]) {
                    mouseActions[index] = action;
                }
            });

            this.settings._settings.set_strv("mouse-actions", mouseActions);

            this.clutterSettings = Clutter.Settings.get_default();
            this.clutterSettings.double_click_time = 200;

            this._automaticUpdateToggle = new PopupMenu.PopupSwitchMenuItem(
                "Determine player automatically",
                true
            );

            this._automaticUpdateToggle.track_hover = false;

            this._automaticUpdateToggle.connect("toggled", (widget, value) => {
                this.isFixedPlayer = !value;
                this.updatePlayer();
            });

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(this._automaticUpdateToggle);

            (async () => {
                try {
                    this._playersProxy = await createProxy(
                        "org.freedesktop.DBus",
                        "org.freedesktop.DBus",
                        "/org/freedesktop/DBus"
                    );

                    this._playersProxy.ListNamesRemote((names, error) => {
                        if (error) {
                            logError(error);
                        } else {
                            (async () => {
                                try {
                                    for (let name of names[0]) {
                                        if (name.includes("org.mpris.MediaPlayer2")) {
                                            await this._addPlayer(name);
                                        }
                                    }

                                    this.updatePlayer(null);
                                } catch (error) {
                                    logError(error);
                                }
                            })();
                        }
                    });

                    this._playersProxy.connectSignal("NameOwnerChanged", (...[, , [busName, ,]]) => {
                        if (
                            busName &&
                            busName.includes("org.mpris.MediaPlayer2") &&
                            !this._players[busName]
                        ) {
                            (async () => {
                                await this._addPlayer(busName);
                                this.updatePlayer(null);
                            })();
                        }
                    });
                } catch (error) {
                    logError(error);
                }
            })();
        }

        disable() {
            this.removeWidgets();
            this.settings.disconnectSignals();

            for (let playerObj of Object.values(this._players)) {
                playerObj.destroy();
            }

            this.destroy();
        }

        addWidgets() {
            delete Main.panel.statusArea["media_controls_extension"];
            Main.panel.addToStatusArea(
                "media_controls_extension",
                this,
                this.settings.extensionIndex,
                this.settings.extensionPosition
            );

            this.add_child(this.player.container);

            this.settings.elementOrder.forEach((element) => {
                if (element === "icon" && this.settings.showPlayerIcon) {
                    this.player.dummyContainer.add_child(this.player.buttonPlayer);
                } else if (element === "title" && this.settings.showTrackName) {
                    this.player.dummyContainer.add_child(this.player.containerButtonLabel);
                    if (this.settings.showSeperators) {
                        this.player.subContainerLabel.add_child(this.player.labelSeperatorStart);
                    }
                    this.player.subContainerLabel.add_child(this.player.labelTitle);
                    if (this.settings.showSeperators) {
                        this.player.subContainerLabel.add_child(this.player.labelSeperatorEnd);
                    }
                } else if (element === "controls" && this.settings.showControls) {
                    this.player.dummyContainer.add_child(this.player.containerControls);
                    if (this.settings.showPrevButton) {
                        this.player.containerControls.add_child(this.player.buttonPrev);
                    }
                    if (this.settings.showPlayPauseButton) {
                        this.player.containerControls.add_child(this.player.buttonPlayPause);
                    }
                    if (this.settings.showNextButton) {
                        this.player.containerControls.add_child(this.player.buttonNext);
                    }
                } else if (element === "menu" && this.settings.showMenu) {
                    this.player.dummyContainer.add_child(this.player.buttonMenu);
                }
            });
        }

        removeWidgets() {
            delete Main.panel.statusArea["media_controls_extension"];

            if (this.player) {
                this.remove_child(this.player.container);

                this.player.dummyContainer.remove_child(this.player.buttonPlayer);

                this.player.dummyContainer.remove_child(this.player.containerButtonLabel);

                this.player.subContainerLabel.remove_child(this.player.labelTitle);
                this.player.subContainerLabel.remove_child(this.player.labelSeperatorStart);
                this.player.subContainerLabel.remove_child(this.player.labelSeperatorEnd);

                this.player.dummyContainer.remove_child(this.player.containerControls);

                this.player.containerControls.remove_child(this.player.buttonPrev);
                this.player.containerControls.remove_child(this.player.buttonPlayPause);
                this.player.containerControls.remove_child(this.player.buttonNext);

                this.player.dummyContainer.remove_child(this.player.buttonMenu);
            } else {
                this.remove_all_children();
            }
        }

        async _addPlayer(busName) {
            try {
                let playerObj = await new Player(busName, this);
                if (
                    this.settings.blacklistApps.every(
                        (app) => !playerObj.name.toLowerCase().includes(app.toLowerCase())
                    )
                ) {
                    let menuItem = playerObj.menuItem;

                    menuItem.connect("activate", (menuItem) => {
                        this.toggleActivatePlayer(menuItem.busName);
                    });

                    this.menu.addMenuItem(menuItem);
                    this._players[busName] = playerObj;

                    if (!playerObj._metadata["title"]) {
                        this.hidePlayer(busName);
                    }
                } else {
                    playerObj.destroy();
                    playerObj = null;
                }
            } catch (error) {
                logError(error);
            }
        }

        _removePlayer(busName) {
            let playerObj = this._players[busName];

            // Remove menu item from the source menu
            this.menu.box.remove_child(playerObj.menuItem);
            // Remove track information menu menu
            Main.panel.menuManager.removeMenu(playerObj.menu);

            playerObj.destroy();

            delete this._players[busName];
        }

        /**
         * Determines the currently selected player
         * @param {null || Player || string} player
         */
        updatePlayer(player = null) {
            if (!this.player && this.isFixedPlayer) {
                this.isFixedPlayer = false;
            }

            if (!player && !this.isFixedPlayer) {
                const validPlayers = [];
                for (let playerName in this._players) {
                    let playerObj = this._players[playerName];
                    if (playerObj._metadata["title"] && !playerObj.hidden) {
                        validPlayers.push(playerObj);
                        if (playerObj.isPlaying) {
                            player = playerObj;
                        }
                    }
                }

                if (!player) {
                    player = validPlayers[0];
                }
            }

            if (player && (player instanceof Player || typeof player === "string")) {
                if (this.player) {
                    this.player.active = false;
                    this.removeWidgets();

                    Gio.bus_unwatch_name(this.playerWatchId);
                    Main.panel.menuManager.removeMenu(this.player.menu);
                }

                this.player = typeof player === "string" ? this._players[player] : player;

                if (!this.player.dummyContainer) {
                    this.player.initWidgets();
                }

                Main.panel.menuManager.addMenu(this.player.menu);

                this.playerWatchId = Gio.bus_watch_name(
                    Gio.BusType.SESSION,
                    this.player.busName,
                    Gio.BusNameWatcherFlags.NONE,
                    null,
                    this.playerVanished.bind(this)
                );

                this.removeWidgets();
                this.addWidgets();

                this.player.active = true;
            } else if (!this.player) {
                this.removeWidgets();
            }
        }

        toggleActivatePlayer(busName) {
            if (this.isFixedPlayer && this.player && busName === this.player.busName) {
                this.fixedPlayer = false;
                this.updatePlayer();
            } else {
                this.fixedPlayer = true;
                this.updatePlayer(busName);
            }
        }

        hidePlayer(busName) {
            const playerObj = this._players[busName];

            if (playerObj) {
                // Remove menu item from the source menu
                this.menu.box.remove_child(playerObj.menuItem);
                // Remove track information menu menu
                Main.panel.menuManager.removeMenu(playerObj.menu);

                playerObj.hidden = true;

                if (this.player && this.player.busName === busName && this.fixedPlayer) {
                    this.fixedPlayer = false;
                    this.updatePlayer();
                } else if (this.player && this.player.busName !== busName && this.fixedPlayer) {
                    this.updatePlayer(this.player);
                } else {
                    this.updatePlayer();
                }
            }
        }

        unhidePlayer(busName) {
            const playerObj = this._players[busName];
            if (playerObj) {
                this.menu.addMenuItem(playerObj.menuItem);
                playerObj.hidden = false;
                if (this.isFixedPlayer) {
                    this.updatePlayer(this.player);
                } else {
                    this.updatePlayer();
                }
            }
        }

        playerVanished(connection, name) {
            if (name === this.player.busName) {
                Gio.bus_unwatch_name(this.playerWatchId);
                this._removePlayer(this.player.busName);

                this.player = null;

                this.updatePlayer();
            } else {
                this._removePlayer(name);
            }
        }

        destroy() {
            super.destroy();
        }

        get fixedPlayer() {
            return this.isFixedPlayer;
        }

        set fixedPlayer(value) {
            this.isFixedPlayer = value;
            this._automaticUpdateToggle.setToggleState(!value);
        }
    }
);

/*

                                    MediaControls(PanelButton)
                                                |
                                               / \
                                              /   \
                                             /     \
                          Player (PanelButton)     Source menu (arrow icon)
                                |
                               / \
                              /   \
                             /     \
                            /       \
                   buttonLabel     containerControls
                       |                        |
                      / \                      /|\__________buttonNext
                     /   \       buttonPrev___/  \                  |
                    /     \           |           \                  \  
            iconPlayer   labelTitle   |          buttonPlayPause      \
                                      |               |                iconNext 
                                      |           iconPlayPause
                                  iconPrev
*/
