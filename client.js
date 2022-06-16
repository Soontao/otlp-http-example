'use strict';

const api = require('@opentelemetry/api');
const tracer = require('./tracer')('example-http-client');
const http = require('http');
const { SemanticAttributes } = require('@opentelemetry/semantic-conventions');

const getCurrentContext = () => api.trace.getSpan(api.context.active())

const createNewContext = () => {
  return api.trace.setSpan(api.context.active(), getCurrentContext())
}

/**
 * create sub span base current context
 *
 * @param {string} newSpanName
 * @param {import("@opentelemetry/api").SpanOptions} options
 * @returns
 */
const createSubSpan = (newSpanName, options) => {
  return tracer.startSpan(newSpanName, options, createNewContext())
}

const runWithNewContextCb = (newSpanName, fn) => {
  const newSpan = createSubSpan(newSpanName)
  api.context.with(api.trace.setSpan(api.context.active(), newSpan), () => fn(newSpan))
}

const runWithNewContextProm = async (newSpanName, options, fn) => {
  if (fn === undefined) { [options, fn] = [fn, options] }
  return new Promise((resolve, reject) => {

    const newSpan = createSubSpan(newSpanName, {
      attributes: {
        [SemanticAttributes.CODE_FUNCTION]: fn.name ?? 'Unknown'
      }
    })
    api.context.with(api.trace.setSpan(api.context.active(), newSpan), () => {
      fn().then(resolve).catch(reject).finally(() => newSpan.end())
    })
  })
}

const get = () => {
  return new Promise((resolve, reject) => {
    http.get(
      {
        host: 'localhost',
        port: 8080,
        path: '/helloworld',
      },
      (response) => {
        const body = [];
        response.on('data', (chunk) => {
          body.push(chunk)
        });
        response.on('end', () => {
          resolve(body.toString())
        });
      }
    );
  })

}

runWithNewContextCb("exec", async span => {
  await Promise.all(Array(10).fill(0).map(() => {
    runWithNewContextProm("make request prom", get)
  }))
  span.end()
})
