var Workspace = require("./tiny").Workspace;

var ws = new Workspace();
ws.addRule({head: [["ancestor", "A", "B"]],
            body: [["parent", "A", "B"]]});
ws.addRule({head: [["ancestor", "A", "C"]], 
            body: [["ancestor", "A", "B"],
                   ["ancestor", "B", "C"]]});
ws.insert("parent", "ben", "jan");
ws.insert("parent", "petra", "jan");
ws.insert("parent", "jan", "zef");
ws.insert("parent", "antoinet", "zef");
ws.fixpoint();
console.log(ws.query("ancestor", "X", "zef"));