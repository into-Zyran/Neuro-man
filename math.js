/* ===================================================================
   math.js — Neural Network & Genetic Algorithm
   All matrix ops use flat 1D arrays to minimize GC pressure.
   =================================================================== */
'use strict';

// ─────────────────────────────────────────────
// 1.  UTILITY
// ─────────────────────────────────────────────

/** Seeded fast random (mulberry32) for reproducible weights. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tanh(x) { return Math.tanh(x); }

function leakyRelu(x) { return x > 0 ? x : 0.05 * x; }

function randn() {
  // Box-Muller: gaussian(0,1)
  const u = Math.max(1e-7, 1 - Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─────────────────────────────────────────────
// 2.  FEEDFORWARD NEURAL NETWORK
//     Flat 1D weight arrays — zero object allocations on forward pass
// ─────────────────────────────────────────────

class NeuralNet {
  /**
   * @param {number[]} topology  e.g. [12, 10, 4]
   */
  constructor(topology = [12, 10, 4]) {
    this.topology = topology;
    this.layers   = topology.length;
    // weight arrays: W[l] is flat array of size [out × in]
    // bias arrays:   B[l] is flat array of size [out]
    this.W = [];
    this.B = [];
    for (let l = 0; l < this.layers - 1; l++) {
      const inn  = topology[l];
      const out  = topology[l + 1];
      // Xavier / Glorot initialization
      const gain = Math.sqrt(2.0 / (inn + out));
      const w = new Float64Array(out * inn);
      for (let i = 0; i < w.length; i++) w[i] = randn() * gain;
      this.W.push(w);
      const b = new Float64Array(out);
      for (let i = 0; i < b.length; i++) b[i] = randn() * 0.1;
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
      const inn  = this.topology[l];
      const out  = this.topology[l + 1];
      const W    = this.W[l];
      const B    = this.B[l];
      const next = new Float64Array(out);
      const isOutput = (l === this.layers - 2);

      for (let j = 0; j < out; j++) {
        let sum = B[j];
        const offset = j * inn;
        for (let i = 0; i < inn; i++) sum += W[offset + i] * current[i];
        // Hidden layers use tanh/leaky, output uses tanh
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
      for (let i = 0; i < this.W[l].length; i++) {
        if (idx < arr.length) this.W[l][i] = arr[idx++];
      }
      for (let i = 0; i < this.B[l].length; i++) {
        if (idx < arr.length) this.B[l][i] = arr[idx++];
      }
    }
  }

  /** Total number of trainable parameters */
  getParameterCount() {
    let count = 0;
    for (let l = 0; l < this.layers - 1; l++) {
      count += this.topology[l] * this.topology[l + 1] + this.topology[l + 1];
    }
    return count;
  }

  /** Deep clone this network. */
  clone() {
    const copy = new NeuralNet(this.topology);
    copy.setWeights(this.getWeights());
    return copy;
  }

  /** Serialize to JSON */
  toJSON() {
    return {
      topology: this.topology,
      weights: this.getWeights()
    };
  }

  /** Deserialize from JSON */
  static fromJSON(json) {
    const net = new NeuralNet(json.topology);
    net.setWeights(json.weights);
    return net;
  }
}

// ─────────────────────────────────────────────
// 3.  GENETIC ALGORITHM
// ─────────────────────────────────────────────

const GA = (() => {
  const TOPOLOGY       = [12, 10, 4];
  const SWARM_SIZE     = 35;
  const ELITE_COUNT    = 2;
  const BASE_MUTATION  = 0.08;
  const ENTROPY_MUTATION = 0.20;

  /** Create a fresh random network. */
  function createBrain() { return new NeuralNet(TOPOLOGY); }

  /**
   * Tournament selection — picks the fittest of k random specimens.
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
   * Uniform blend crossover on two flat weight arrays.
   * Each gene inherited with 50/50 chance or subtle blend.
   */
  function crossover(a, b) {
    const child = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      const r = Math.random();
      if (r < 0.45) {
        child[i] = a[i];
      } else if (r < 0.90) {
        child[i] = b[i];
      } else {
        // Blend interpolation
        child[i] = 0.5 * (a[i] + b[i]);
      }
    }
    return child;
  }

  /**
   * Adaptive Gaussian mutation.
   * @param {Float64Array|number[]} genes
   * @param {number} rate  probability each gene mutates
   * @param {boolean} entropy  whether to apply big entropy jump
   */
  function mutate(genes, rate, entropy) {
    const effectiveRate = entropy ? rate + ENTROPY_MUTATION : rate;
    const power = entropy ? 0.6 : 0.25;
    const result = new Float64Array(genes.length);
    for (let i = 0; i < genes.length; i++) {
      result[i] = genes[i];
      if (Math.random() < effectiveRate) {
        // Gaussian perturbation with occasional Cauchy sign flip
        if (Math.random() < 0.05) {
          result[i] = randn() * 1.0; // complete gene reset
        } else {
          result[i] += randn() * power;
        }
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

    // Multi-Elitism: top ELITE_COUNT agents survive unchanged
    for (let i = 0; i < Math.min(ELITE_COUNT, scored.length); i++) {
      nextGen.push(scored[i].net.clone());
    }

    // Fill remaining slots via tournament selection + crossover + mutation
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

  return {
    TOPOLOGY,
    SWARM_SIZE,
    ELITE_COUNT,
    BASE_MUTATION,
    createBrain,
    evolve,
    crossover,
    mutate
  };
})();

