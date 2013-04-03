/*global tiny:true*/
(function() {
    if (typeof require !== "undefined") {
        tiny = require("./tiny");
    }
    var registerBuiltin = tiny.registerBuiltin;

    registerBuiltin("int:add", function(query) {
        var result = {};
        result[query[3]] = query[1] + query[2];
        return [result];
    });
    registerBuiltin("int:subt", function(query) {
        var result = {};
        result[query[3]] = query[1] - query[2];
        return [result];
    });
    registerBuiltin("int:mul", function(query) {
        var result = {};
        result[query[3]] = query[1] * query[2];
        return [result];
    });
    registerBuiltin("int:div", function(query) {
        var result = {};
        result[query[3]] = query[1] / query[2];
        return [result];
    });
    registerBuiltin("int:lessThan", function(query, binding) {
        if (query[1] < query[2]) {
            return [binding];
        } else {
            return [];
        }
    });
})();