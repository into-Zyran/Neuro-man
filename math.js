/* ===================================================================
   math.js — Neural Network & Genetic Algorithm
   All matrix ops use flat 1D arrays to minimize GC pressure.
   =================================================================== */
'use strict';

// ─────────────────────────────────────────────
// 1.  UTILITY
// ─────────────────────────────────────────────

/** Seeded fast random (mulberry32) for reproducible champion weights. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function tanh(x) { return Math.tanh(x); }

function randn() {
  // Box-Muller: gaussian(0,1)
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─────────────────────────────────────────────
// 2.  FEEDFORWARD NEURAL NETWORK
//     Flat 1D weight arrays — zero object allocations on forward pass
// ─────────────────────────────────────────────

class NeuralNet {
  /**
   * @param {number[]} topology  e.g. [8, 6, 4]
   */
  constructor(topology) {
    this.topology = topology;
    this.layers   = topology.length;
    // weight arrays: W[l] is flat array of size [out × in]
    // bias arrays:   B[l] is flat array of size [out]
    this.W = [];
    this.B = [];
    for (let l = 0; l < this.layers - 1; l++) {
      const inn  = topology[l];
      const out  = topology[l + 1];
      // Xavier/Glorot initialisation
      const gain = Math.sqrt(2.0 / (inn + out));
      const w = new Float64Array(out * inn);
      for (let i = 0; i < w.length; i++) w[i] = randn() * gain;
      this.W.push(w);
      const b = new Float64Array(out);
      this.B.push(b);
    }
    // activation cache for neural-viz
    this.activations = [];
  }

  /** Forward pass. Returns output Float64Array (length = last topology node). */
  forward(inputs) {
    this.activations = [];
    let current = new Float64Array(inputs.length);
    for (let i = 0; i < inputs.length; i++) current[i] = inputs[i];
    this.activations.push(current);

    for (let l = 0; l < this.layers - 1; l++) {
      const inn = this.topology[l];
      const out = this.topology[l + 1];
      const W   = this.W[l];
      const B   = this.B[l];
      const next = new Float64Array(out);
      for (let j = 0; j < out; j++) {
        let sum = B[j];
        const offset = j * inn;
        for (let i = 0; i < inn; i++) sum += W[offset + i] * current[i];
        next[j] = tanh(sum);
      }
      current = next;
      this.activations.push(current);
    }
    return current;
  }

  /** Get all weights as a flat JS array for GA manipulation. */
  getWeights() {
    const out = [];
    for (let l = 0; l < this.W.length; l++) {
      for (let i = 0; i < this.W[l].length; i++) out.push(this.W[l][i]);
      for (let i = 0; i < this.B[l].length; i++) out.push(this.B[l][i]);
    }
    return out;
  }

  /** Load weights from a flat JS array. */
  setWeights(arr) {
    let idx = 0;
    for (let l = 0; l < this.W.length; l++) {
      for (let i = 0; i < this.W[l].length; i++) this.W[l][i] = arr[idx++];
      for (let i = 0; i < this.B[l].length; i++) this.B[l][i] = arr[idx++];
    }
  }

  /** Deep clone this network. */
  clone() {
    const copy = new NeuralNet(this.topology);
    copy.setWeights(this.getWeights());
    return copy;
  }
}

// ─────────────────────────────────────────────
// 3.  GENETIC ALGORITHM
// ─────────────────────────────────────────────

const GA = (() => {
  const TOPOLOGY      = [8, 6, 4];
  const SWARM_SIZE    = 35;
  const BASE_MUTATION = 0.06;
  const ENTROPY_MUTATION = 0.15;

  /** Create a fresh random network. */
  function createBrain() { return new NeuralNet(TOPOLOGY); }

  /**
   * Tournament selection — picks the fitter of k random specimens.
   * @param {{net: NeuralNet, fitness: number}[]} pool
   * @param {number} k tournament size
   */
  function tournamentSelect(pool, k = 3) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const cand = pool[Math.floor(Math.random() * pool.length)];
      if (best === null || cand.fitness > best.fitness) best = cand;
    }
    return best;
  }

  /**
   * Uniform crossover on two flat weight arrays.
   * Each gene inherited with 50/50 chance from either parent.
   */
  function crossover(a, b) {
    const child = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      child[i] = Math.random() < 0.5 ? a[i] : b[i];
    }
    return child;
  }

  /**
   * Gaussian mutation with adaptive rate.
   * @param {Float64Array|number[]} genes
   * @param {number} rate  probability each gene mutates
   * @param {boolean} entropy  whether to apply big entropy jump
   */
  function mutate(genes, rate, entropy) {
    const effectiveRate = entropy ? rate + ENTROPY_MUTATION : rate;
    const result = new Float64Array(genes.length);
    for (let i = 0; i < genes.length; i++) {
      result[i] = genes[i];
      if (Math.random() < effectiveRate) {
        result[i] += randn() * (entropy ? 0.5 : 0.2);
      }
    }
    return result;
  }

  /**
   * Evolve the swarm into the next generation.
   * @param {{net: NeuralNet, fitness: number}[]} scored   sorted desc by fitness
   * @param {boolean} applyEntropy
   * @returns {NeuralNet[]}
   */
  function evolve(scored, applyEntropy) {
    const nextGen = [];

    // Elitism: top 1 survives unchanged
    nextGen.push(scored[0].net.clone());

    // Fill remaining 34 slots via tournament + crossover + mutation
    while (nextGen.length < SWARM_SIZE) {
      const parentA = tournamentSelect(scored);
      const parentB = tournamentSelect(scored);
      const genesA  = parentA.net.getWeights();
      const genesB  = parentB.net.getWeights();
      const child   = crossover(genesA, genesB);
      const mutated = mutate(child, BASE_MUTATION, applyEntropy);
      const brain   = new NeuralNet(TOPOLOGY);
      brain.setWeights(Array.from(mutated));
      nextGen.push(brain);
    }
    return nextGen;
  }

  return { TOPOLOGY, SWARM_SIZE, BASE_MUTATION, createBrain, evolve };
})();
