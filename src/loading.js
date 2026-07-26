/*
 * операции по инициаизации загрузки игры, по загрузке ресурсов игры, конфигов
 */

set(__window, '$INIT$', (projectData) => {

    document.body.innerHTML = "<div id='gameDiv' style='position:absolute; left:0; top:0;'></div>";

    projectData = projectData || globalConfigsData["build_res/opts.json"] || {};

    mergeObjectDeep(options, projectData.options);

    createGame({
        element: document.getElementById('gameDiv'),

        onCreate() {
            scene.onResize = function () {
                scene.__eachChild(function (c) {
                    c.update(1);
                });
            };

            consoleLog('beginLoadGameResources');

            TASKS_RUN( projectData.res, a => {

                BUS.__post(__ON_GAME_LOADED);

            });

        }
    });

});

