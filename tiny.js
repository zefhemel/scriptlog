// Adapted from: https://github.com/fkettelhoit/bottom-up-datalog-js

/*global Trie:true*/

var tiny = (function() {
    if(typeof require !== "undefined") {
        Trie = require("./trie");
    }
    
    /**
     * Simple Event Emitter implementation
     */
    function EventEmitter() {
    }
    
    EventEmitter.prototype = {
        addListener: function(event, fct) {
            this._events = this._events || {};
            this._events[event] = this._events[event] || [];
            this._events[event].push(fct);
        },
        removeListener: function(event, fct) {
            this._events = this._events || {};
            if (event in this._events === false) {
                return;
            }
            this._events[event].splice(this._events[event].indexOf(fct), 1);
        },
        emit: function(event /* , args... */ ) {
            this._events = this._events || {};
            if (event in this._events === false) {
                return;
            }
            var args = Array.prototype.slice.call(arguments, 1);
            for (var i = 0; i < this._events[event].length; i++) {
                this._events[event][i].apply(this, args);
            }
        }
    };
    
    EventEmitter.prototype.on = EventEmitter.prototype.addListener;
    
    function extend(dest, source) {
        for(var p in source) {
            if(source.hasOwnProperty(p)) {
                dest[p] = source[p];
            }
        }
    }
    
    /**
     * Rule
     */
    function Rule(headAtom, bodyAtoms) {
        this.headAtom = headAtom;
        this.bodyAtoms = bodyAtoms;
    }

    Rule.prototype = {
        applyToWorkspace: function(ws) {
            var rule = this;
            var headAtom = this.headAtom;
            var predicateToAddTo = ws.getPredicate(headAtom[0]);
            this.generateBindings(ws).forEach(function(binding) {
                var newFact = substitute(headAtom, binding);

                if (headAtom.delta === '+') {
                    ws.insert(new Atom(newFact));
                } else if (headAtom.delta === "-") {
                    ws.remove(newFact);
                } else {
                    // Have to do $insert, because it's a IDB
                    rule.bodyAtoms.forEach(function(goal) {
                        newFact.addDerivedAtom(Atom.hashCode(substitute(goal, binding)), ws);
                    });
                    predicateToAddTo.$insert(newFact, ws);
                }
            });
        },
        generateBindings: function(ws) {
            var currentBindings;
            this.bodyAtoms.forEach(function(goal, index) {
                var ar = ws.queryBindings(goal, currentBindings);
                if (index === 0) {
                    currentBindings = ar;
                } else {
                    currentBindings = unifyBindingArrays(currentBindings, ar);
                }
            });
            return currentBindings;
        },
        toString: function() {
            return JSON.stringify(this, null, 4);
        }
    };

    /**
     * @param derivedFrom are hashcodes
     */
    function Atom(array) {
        this.init(array);
    }

    Atom.prototype = {
        init: function(array) {
            for (var i = 0; i < array.length; i++) {
                this[i] = array[i];
            }
            this.length = array.length;
            // HashCodes for
            this.derivedFrom = [];
            this.resultedIn = []; // Inverse of derivedFrom
            this.hashCode = Atom.hashCode(this);
        },
        equals: function(other) {
            return this.hashCode === other.hashCode;
        },
        addDerivedAtom: function(hashCode, ws) {
            var index = this.derivedFrom.indexOf(hashCode);
            if (index === -1) {
                this.derivedFrom.push(hashCode);
                var resultedInAtom = ws.getPredicate(Atom.predicateNameFromHashCode(hashCode)).getFactByHashCode(hashCode);
                if (resultedInAtom) {
                    resultedInAtom.addResultedIn(this.hashCode);
                }
            }
        },
        addResultedIn: function(hashCode) {
            var index = this.resultedIn.indexOf(hashCode);
            if (index === -1) {
                this.resultedIn.push(hashCode);
            }
        },
        isFullyBound: function() {
            for (var i = 0; i < this.length; i++) {
                var el = this[i];
                if (isVar(el)) {
                    return false;
                }
            }
            return true;
        },
        toString: function() {
            return this.hashCode;
        }
    };

    Atom.hashCode = function(atom) {
        var args = [];
        for (var i = 1; i < atom.length; i++) {
            args.push(atom[i]);
        }
        return atom[0] + "(" + args.join(",") + ")";
    };

    Atom.predicateNameFromHashCode = function(hashCode) {
        return hashCode.substring(0, hashCode.indexOf("("));
    };

    function DeltaAtom(delta, array) {
        this.init(array);
        this.delta = delta;
    }

    DeltaAtom.prototype = new Atom([]);

    function EDBPredicate(name) {
        this.name = name;
        this.facts = new Trie();
        this.hashToFact = {};
    }

    function getQueryPrefix(query) {
        var index = query.hashCode.indexOf("?");
        if (index === -1) {
            return query.hashCode;
        } else {
            return query.hashCode.substring(0, index);
        }
    }

    EDBPredicate.prototype = {
        constructor: EDBPredicate,
        count: function() {
            //return this.facts.length;
            return Object.keys(this.hashToFact).length;
        },
        insert: function(atom, ws) {
            var foundAtom = this.find(atom);
            if (!foundAtom) {
                this.facts.insert(atom.hashCode);
                this.hashToFact[atom.hashCode] = atom;
                this.emit("insert", atom);
            } else if (atom.derivedFrom.length > 0) {
                for (var i = 0; i < atom.derivedFrom.length; i++) {
                    foundAtom.addDerivedAtom(atom.derivedFrom[i], ws);
                }
            }
        },
        /**
         * @return array of mappings (objects)
         */
        queryBindings: function(query) {
            var facts = this.facts;
            var hashToFact = this.hashToFact;
            var results = [];
            var prefixMatches = facts.prefixMatches(getQueryPrefix(query));
            for (var i = 0; i < prefixMatches.length; i++) {
                var atom = hashToFact[prefixMatches[i]];
                var unification = unify(query, atom);
                if (unification) {
                    results.push(unification);
                }
            }
            return results;
        },
        getFactByHashCode: function(hashCode) {
            return this.hashToFact[hashCode];
        },
        // Returns atoms themselves
        query: function(query) {
            var facts = this.facts;
            var results = [];
            var hashToFact = this.hashToFact;
            var prefixMatches = facts.prefixMatches(getQueryPrefix(query));
            for (var i = 0; i < prefixMatches.length; i++) {
                var atom = hashToFact[prefixMatches[i]];
                if (unify(query, atom)) {
                    results.push(atom);
                }
            }
            return results;
        },
        remove: function(atom) {
            var fact = this.hashToFact[atom.hashCode];
            if (fact === undefined) {
                return;
            }
            this.facts.remove(atom.hashCode);
            delete this.hashToFact[atom.hashCode];
            this.emit("remove", atom);
        },
        removeFactsThatDependOn: function(atomToRemove, ws) {
            var hashCodeToLookFor = atomToRemove.hashCode;
            this.eachFact(function(atom) {
                var hashIndex = atom.derivedFrom.indexOf(hashCodeToLookFor);
                if (hashIndex !== -1) {
                    ws.remove(atom);
                }
            }, true); // Need to slice first, because we're possibly changing the list as we go
        },
        find: function(atom) {
            var fact = this.hashToFact[atom.hashCode];
            if (fact !== undefined) {
                return fact;
            } else {
                return null;
            }
        },
        contains: function(atom) {
            return !!this.find(atom);
        },
        eachFact: function(fn) {
            this.facts.forEach(fn);
        },
        toString: function() {
            var s = '';
            this.eachFact(function(atom) {
                s += "- " + atom.toString() + " derived from " + (atom.derivedFrom ? atom.derivedFrom.join(", ") : "") + "\n";
            });
            return s;
        }
    };
    
    // Make EDBPredicate an event emitter
    extend(EDBPredicate.prototype, EventEmitter.prototype);

    function IDBPredicate(name) {
        this.name = name;
        this.facts = new Trie();
        this.hashToFact = {};
    }

    IDBPredicate.prototype = new EDBPredicate();
    
    IDBPredicate.prototype.constructor = IDBPredicate;

    IDBPredicate.prototype.$insert = IDBPredicate.prototype.insert;

    IDBPredicate.prototype.insert = function() {
        throw new Error("Cannot insert into IDB Predicate");
    };
    

    function BuiltinPredicate(name, fn) {
        this.name = name;
        this.fn = fn;
    }

    BuiltinPredicate.prototype = new IDBPredicate();
    
    BuiltinPredicate.prototype.constructor = BuiltinPredicate;

    BuiltinPredicate.prototype.queryBindings = function(query, currentBindings) {
        var results = [];
        var fn = this.fn;
        currentBindings = currentBindings || [{}];
        currentBindings.forEach(function(binding) {
            var boundQuery = substitute(query, binding);
            fn(boundQuery, binding).forEach(function(result) {
                results.push(result);
            });
        });
        return results;
    };

    BuiltinPredicate.prototype.count = function() {
        return 0;
    };

    BuiltinPredicate.prototype.removeFactsThatDependOn = function() {
        return;
    };

    BuiltinPredicate.prototype.toString = function() {
        return "[Builtin]";
    };

    BuiltinPredicate.prototype.getFactByHashCode = function() {
        return null;
    };

    function Workspace() {
        this.installedRules = [];
        this.predicates = {
            "int:add": new BuiltinPredicate("int:add", function(query) {
                var result = {};
                result[query[3]] = query[1] + query[2];
                return [result];
            }),
            "int:lessThan": new BuiltinPredicate("int:lessThan", function(query, binding) {
                if (query[1] < query[2]) {
                    return [binding];
                } else {
                    return [];
                }
            }),
        };
    }

    Workspace.prototype = {
        addRule: function(rule) {
            this.installedRules.push(rule);
            var predName = rule.headAtom[0];
            if(rule.headAtom.delta) {
                this.createEDBPredicate(predName);
            } else {
                this.createIDBPredicate(predName);
            }
        },
        createEDBPredicate: function(name) {
            var predicate = this.getPredicate(name);
            if (predicate && predicate.constructor !== EDBPredicate) {
                throw new Error("Predicate " + name + " redefined as EDB predicate");
            } else if(predicate) {
                return predicate;
            }
            this.predicates[name] = new EDBPredicate(name);
            return this.predicates[name];
        },
        createIDBPredicate: function(name) {
            var predicate = this.getPredicate(name);
            if (predicate && predicate.constructor !== IDBPredicate) {
                throw new Error("Predicate " + name + " redefined as IDB predicate");
            } else if(predicate) {
                return predicate;
            }
            this.predicates[name] = new IDBPredicate(name);
            return this.predicates[name];
        },
        insert: function(atom) {
            var predicate = this.getPredicate(atom[0]);
            if (!predicate) {
                predicate = this.createEDBPredicate(atom[0]);
            }
            predicate.insert(new Atom(atom), this);
        },
        remove: function(atomToRemove) {
            var ws = this;
            var predicateName = atomToRemove[0];
            var predicate = this.getPredicate(predicateName);
            if(!predicate) {
                predicate = this.createEDBPredicate(predicateName);
            }
            if (!atomToRemove.isFullyBound()) {
                this.query(atomToRemove).forEach(function(atom) {
                    ws.remove(atom);
                });
            } else {
                atomToRemove = predicate.find(atomToRemove);
                predicate.remove(atomToRemove);
                atomToRemove.resultedIn.forEach(function(hashCode) {
                    var fact = ws.getPredicate(Atom.predicateNameFromHashCode(hashCode)).getFactByHashCode(hashCode);
                    if (fact) {
                        ws.remove(fact);
                    }
                });
            }
        },
        upsert: function(atom) {
            // First remove atom with all same values, except last key
            var atomToRemoveArray = [];
            for (var i = 0; i < atom.length - 1; i++) {
                atomToRemoveArray.push(atom[i]);
            }
            atomToRemoveArray.push("?");
            var atomToRemove = new Atom(atomToRemoveArray);
            this.remove(atomToRemove);
            this.insert(atom);
        },
        contains: function(fact) {
            var predicateName = fact[0];
            return this.getPredicate(predicateName).contains(fact);
        },
        eachPredicate: function(fn) {
            var ws = this;
            Object.keys(this.predicates).forEach(function(predicateName) {
                fn(ws.predicates[predicateName]);
            });
        },
        fixpointRules: function(rules) {
            var ws = this;
            // Install first
            rules.forEach(function(rule) {
                ws.installedRules.push(rule);
            });
            ws.fixpoint();
            // And then remove again
            rules.forEach(function(rule) {
                ws.installedRules.splice(ws.installedRules.indexOf(rule), 1);
            });
        },
        fixpoint: function(iteration) {
            iteration = iteration || 1;
            // Prevent infinite iteration
            if (iteration > 1000) {
                throw Error("More than 1000 iterations");
            }
            var factCountBefore = this.countFacts();
            var rules = this.installedRules;
            for (var i = 0; i < rules.length; i++) {
                rules[i].applyToWorkspace(this);
            }
            // Something changed? Go again!
            if (factCountBefore !== this.countFacts()) {
                this.fixpoint(iteration + 1);
            }
        },
        countFacts: function() {
            var count = 0;
            this.eachPredicate(function(predicate) {
                count += predicate.count();
            });
            return count;
        },
        queryBindings: function(query, bindings) {
            var predicateName = query[0];
            var predicate = this.getPredicate(predicateName);
            return predicate.queryBindings(query, bindings);
        },
        query: function(query, bindings) {
            var predicateName = query[0];
            var predicate = this.getPredicate(predicateName);
            return predicate.query(query, bindings);
        },
        getPredicate: function(name) {
            return this.predicates[name];
        },
        find: function(atom) {
            var predicate = this.getPredicate(atom[0]);
            return predicate.find(atom);
        },
        toString: function() {
            var s = "";
            /*Rules\n========\n";
        this.installedRules.forEach(function(rule) {
            s += rule.toString() + "\n";
        });*/
            s += "\nFacts\n========\n";
            this.eachPredicate(function(predicate) {
                s += predicate.name + ":\n";
                s += predicate.toString() + "\n";
            });
            return s;
        }
    };

    /**
     * @param query Atom
     * @return Atom
     */
    function substitute(query, bindings) {
        var result = [];
        for (var i = 0; i < query.length; i++) {
            var el = query[i];
            if (isVar(el)) {
                result.push(bindings[el] !== undefined ? bindings[el] : el);
            } else {
                result.push(el);
            }
        }
        return new Atom(result);
    }

    /**
     * @param identifier string
     * @return boolean
     */
    function isVar(identifier) {
        if (typeof identifier !== "string") {
            return false;
        }
        return identifier[0] === "?";
    }

    /**
     * @param arr1 array of mapping objects
     * @param arr2 array of mapping objects
     * @return array of mapping objects
     */
    function unifyBindingArrays(arr1, arr2) {
        // This is important as items may be added on the fly
        var arr1Length = arr1.length;
        var arr2Length = arr2.length;
        var results = [];
        for (var i = 0; i < arr1Length; i++) {
            var bindings1 = arr1[i];
            for (var j = 0; j < arr2Length; j++) {
                var bindings2 = arr2[j];
                var unified = unifyBindings(bindings1, bindings2);
                if (unified) {
                    results.push(unified);
                }
            }
        }
        return results;
    }

    /**
     * @param arr1 mapping object
     * @param arr2 mapping object
     * @return mapping object or false
     */
    function unifyBindings(bindings1, bindings2) {
        // New object for binding
        var obj = {};
        // So far so good
        var success = true;

        Object.keys(bindings1).forEach(function(b) {
            // If it's set in the other binding, it has to be the same, otherwise FAIL
            if (bindings2[b] !== undefined && bindings1[b] !== bindings2[b]) {
                success = false;
                return;
            } else {
                obj[b] = bindings1[b];
            }
        });
        if (!success) {
            // Shortcut
            return false;
        }
        Object.keys(bindings2).forEach(function(b) {
            if (bindings1[b] !== undefined && bindings2[b] !== bindings2[b]) {
                success = false;
                return;
            } else {
                obj[b] = bindings2[b];
            }
        });
        if (success) {
            return obj;
        } else {
            return false;
        }
    }

    /**
     * @param query Atom
     * @param atom Atom
     * @return mapping object
     */
    function unify(query, atom) {
        var obj = {};
        for (var i = 0; i < query.length; i++) {
            var el = query[i];
            if (!isVar(el) && el !== atom[i]) {
                return false;
            } else if (isVar(el) && el !== "?") {
                obj[el] = atom[i];
            }
        }
        return obj;
    }

    function atom() {
        return new Atom(Array.prototype.slice.call(arguments));
    }

    function deltaAtom(delta) {
        return new DeltaAtom(delta, Array.prototype.slice.call(arguments, 1));
    }

    function rule(headAtom) {
        return new Rule(headAtom, Array.prototype.slice.call(arguments, 1));
    }
    
    function queryEventFilter(query, callback) {
        return function(atom) {
            var result = unify(query, atom);
            if(result) {
                callback(atom, result);
            }
        };
    }
    
    function makeGlobal() {
        window.Workspace = Workspace;
        window.Rule = Rule;
        window.Atom = Atom;
        window.DeltaAtom = DeltaAtom;
        window.atom = atom;
        window.deltaAtom = deltaAtom;
        window.rule = rule;
        window.queryEventFilter = queryEventFilter;
    }

    return {
        Workspace: Workspace,
        Rule: Rule,
        Atom: Atom,
        DeltaAtom: DeltaAtom,
        atom: atom,
        deltaAtom: deltaAtom,
        rule: rule,
        makeGlobal: makeGlobal,
        queryEventFilter: queryEventFilter
    };
})();

if(typeof module !== "undefined") {
    module.exports = tiny;
}