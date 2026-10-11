/** Use visible decision controls, never the ordinary composer, for human answers. */
export async function answerQuestions(page, taskId, text) {
  const task = (await page.evaluate(() => window.agent47.listTasks())).find(t => t.id === taskId);
  for (const [index, q] of task.question.questions.entries()) {
    await page.getByRole('button', { name: new RegExp(`^${index + 1} ·`) }).click();
    if (q.type !== 'text') await page.getByRole(q.type === 'multiple' ? 'checkbox' : 'radio', { name: q.type === 'multiple' ? '补充自定义内容' : '自定义答案', exact: true }).check();
    await page.getByLabel(`自定义回答：${q.header}`, { exact: true }).fill(text);
    await page.getByRole('button', { name: '下一题', exact: true }).click();
  }
  await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
}
