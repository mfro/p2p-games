module.exports = {
    publicPath: '',
    devServer: {
        disableHostCheck: true,
        watchOptions: {
            ignored: /node_modules/,
        },
    },
    configureWebpack: cfg => {
        if (process.env.NODE_ENV === 'production') {
            let rule = cfg.module.rules.find(a => a.test.test('myfile.ts'));
            let i = rule.use.findIndex(a => a.loader == 'thread-loader');
            rule.use.splice(i, 1);
        }
    },
    chainWebpack: cfg => {
        if (process.env.NODE_ENV === 'production') {
            cfg.module
                .rule('ts')
                .use('ts-loader')
                .tap(options => {
                    options.happyPackMode = false;
                    return options
                });
        }
    },
};
