// Adapted from: https://github.com/fkettelhoit/bottom-up-datalog-js

var _ = require("underscore");

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
            var derivedFromFacts = rule.bodyAtoms.map(function(goal) {
                return Atom.hashCode(substitute(goal, binding));
            });
            if (headAtom.delta === '+') {
                ws.insert(newFact);
            } else if (headAtom.delta === "-") {
                ws.remove(newFact);
            } else {
                // Have to do $insert, because it's a IDB
                predicateToAddTo.$insert(new Atom(newFact, derivedFromFacts));
            }
        });
    },
    generateBindings: function(ws) {
        var currentBindings;
        this.bodyAtoms.forEach(function(goal, index) {
            var ar = ws.query(goal, currentBindings);
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
function Atom(array, derivedFrom) {
    this.init(array, derivedFrom);
}

Atom.prototype = {
    init: function(array, derivedFrom) {
        for (var i = 0; i < array.length; i++) {
            this[i] = array[i];
        }
        this.length = array.length;
        this.derivedFrom = derivedFrom || [];
        this.hashCode = Atom.hashCode(this);
    },
    equals: function(other) {
        return this.hashCode === other.hashCode;
    },
    addDerivedAtom: function(hashCode) {
        var index = this.derivedFrom.indexOf(hashCode);
        if(index === -1) {
            this.derivedFrom.push(hashCode);
        }
    },
    isFullyBound: function() {
        for(var i = 0; i < this.length; i++) {
            var el = this[i];
            if(isVar(el)) {
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

function DeltaAtom(delta, array) {
    this.init(array);
    this.delta = delta;
}

_.extend(DeltaAtom.prototype, Atom.prototype);

function EDBPredicate(name) {
    this.name = name;
    this.facts = [];
    this.hashToFact = {};
}

EDBPredicate.prototype = {
    count: function() {
        return this.facts.length;
    },
    get: function(index) {
        return this.facts[index];
    },
    insert: function(atom) {
        var foundAtom = this.find(atom);
        if (!foundAtom) {
            this.facts.push(atom);
            this.hashToFact[atom.hashCode] = atom;
        } else if (atom.derivedFrom.length > 0) {
            for (var i = 0; i < atom.derivedFrom.length; i++) {
                foundAtom.addDerivedAtom(atom.derivedFrom[i]);
            }
        }
    },
    query: function(query) {
        var facts = this.facts;
        var results = [];
        for (var i = 0; i < facts.length; i++) {
            var atom = facts[i];
            var unification = unify(query, atom);
            if (unification) {
                results.push(unification);
            }
        }
        return results;
    },
    remove: function(atom) {
        var fact = this.hashToFact[atom.hashCode];
        if(fact === undefined) {
            return;
        }
        this.facts.splice(this.facts.indexOf(fact), 1);
        delete this.hashToFact[atom.hashCode];
    },
    removeFactsThatDependOn: function(atomToRemove, ws) {
        var hashCodeToLookFor = atomToRemove.hashCode;
        this.eachFact(function(atom) {
            var hashIndex = atom.derivedFrom.indexOf(hashCodeToLookFor);
            if(hashIndex !== -1) {
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
    eachFact: function(fn, sliceFirst) {
        var facts = sliceFirst ? this.facts.slice() : this.facts;
        facts.forEach(fn);
    },
    toString: function() {
        var s = '';
        this.eachFact(function(atom) {
            s += "- " + atom.toString() + " derived from " + (atom.derivedFrom ? atom.derivedFrom.join(", ") : "") + "\n";
        });
        return s;
    }
};

function IDBPredicate(name) {
    this.name = name;
    this.facts = [];
    this.hashToFact = {};
}

_.extend(IDBPredicate.prototype, EDBPredicate.prototype);

IDBPredicate.prototype.$insert = IDBPredicate.prototype.insert;

IDBPredicate.prototype.insert = function() {
    throw new Error("Cannot insert into IDB Predicate");
};

function BuiltinPredicate(name, fn) {
    this.name = name;
    this.fn = fn;
}

_.extend(BuiltinPredicate.prototype, IDBPredicate.prototype);

BuiltinPredicate.prototype.query = function(query, currentBindings) {
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
    },
    addEDBPredicate: function(name) {
        if (this.getPredicate(name)) {
            throw Error("Predicate already exists: " + name);
        }
        this.predicates[name] = new EDBPredicate(name);
    },
    addIDBPredicate: function(name) {
        if (this.getPredicate(name)) {
            throw Error("Predicate already exists: " + name);
        }
        this.predicates[name] = new IDBPredicate(name);
    },
    insert: function(atom, derivedFrom) {
        var predicate = this.getPredicate(atom[0]);
        if (!predicate) {
            throw Error("Predicate not defined: " + atom[0]);
        }
        predicate.insert(new Atom(atom, derivedFrom));
    },
    remove: function(atomToRemove) {
        var ws = this;
        if(!atomToRemove.isFullyBound()) {
            this.query(atomToRemove).forEach(function(bindings) {
                var boundAtom = substitute(atomToRemove, bindings);
                ws.remove(boundAtom);
            });
        } else {
            var predicateName = atomToRemove[0];
            var predicate = this.getPredicate(predicateName);
            predicate.remove(atomToRemove);
            this.eachPredicate(function(predicate) {
                predicate.removeFactsThatDependOn(atomToRemove, ws);
            });
        }
    },
    contains: function(fact) {
        var predicateName = fact[0];
        return this.getPredicate(predicateName).contains(fact);
    },
    eachPredicate: function(fn) {
        _.values(this.predicates).forEach(fn);
    },
    fixpointRules: function(rules) {
        if(!_.isArray(rules)) {
            rules = [rules];
        }
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
    query: function(query, bindings) {
        var predicateName = query[0];
        var predicate = this.predicates[predicateName];
        return predicate.query(query, bindings);
    },
    getPredicate: function(name) {
        return this.predicates[name];
    },
    // Private
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
    return identifier !== "_" && identifier[0].toUpperCase() === identifier[0];
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
        if (!isVar(el) && el !== atom[i] && el !== "_") {
            return false;
        } else if (isVar(el)) {
            obj[el] = atom[i];
        }
    }
    return obj;
}

module.exports = {
    Workspace: Workspace,
    Rule: Rule,
    Atom: Atom,
    DeltaAtom: DeltaAtom,
    atom: function() {
        return new Atom(Array.prototype.slice.call(arguments));
    },
    deltaAtom: function(delta) {
        return new DeltaAtom(delta, Array.prototype.slice.call(arguments, 1));
    },
    rule: function(headAtom) {
        return new Rule(headAtom, Array.prototype.slice.call(arguments, 1));
    }
};