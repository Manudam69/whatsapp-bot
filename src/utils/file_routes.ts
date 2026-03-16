import fs from 'fs'
import path from 'path'
import { Router } from 'express'
import logger from '@/utils/logger'

function buildURLPath(routePath: string[]) {
  const finalPath = routePath.map((value) => (value.startsWith('[') && value.endsWith(']') ? `:${value.slice(1, value.length - 1)}` : value))
  return ('/' + finalPath.join('/').replace('//', '/')).replace('//', '/')
}

export async function initFileBasedRoutes(router: Router, routePath: string[] = [], routeGroups: Record<string, string[]> = {}) {
  const baseDir = path.resolve(__dirname, '..', 'routes')
  const currentDir = path.join(baseDir, ...routePath)
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })

  for await (const entry of entries) {
    if (entry.isDirectory()) {
      await initFileBasedRoutes(router, [...routePath, entry.name], routeGroups)
      continue
    }

    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.ts')) {
      continue
    }

    const importedModule = await import(path.join(currentDir, entry.name))
    const resolvedModule = 'default' in importedModule ? importedModule.default : importedModule
    const controller = ('default' in (resolvedModule as Record<string, unknown>)
      ? (resolvedModule as { default: RestController }).default
      : resolvedModule) as RestController

    if (!controller) {
      continue
    }

    const resourceName = entry.name.includes('index') ? '/' : entry.name.slice(0, entry.name.length - 3)
    const url = buildURLPath([...routePath, resourceName])
    const prefix = url
      .split('/')
      .filter(Boolean)[0] || 'root'

    if (!routeGroups[prefix]) {
      routeGroups[prefix] = []
    }

    if (controller.GET) {
      routeGroups[prefix].push(`GET ${url}`)
      router.get(url, controller.GET)
    }
    if (controller.POST) {
      routeGroups[prefix].push(`POST ${url}`)
      router.post(url, controller.POST)
    }
    if (controller.PUT) {
      routeGroups[prefix].push(`PUT ${url}`)
      router.put(url, controller.PUT)
    }
    if (controller.PATCH) {
      routeGroups[prefix].push(`PATCH ${url}`)
      router.patch(url, controller.PATCH)
    }
    if (controller.DELETE) {
      routeGroups[prefix].push(`DELETE ${url}`)
      router.delete(url, controller.DELETE)
    }
  }

  if (routePath.length === 0) {
    Object.entries(routeGroups).forEach(([group, routes]) => {
      logger.debug(`----- ${group.toUpperCase()} -----`)
      routes.forEach((route) => logger.debug(route))
    })
  }
}