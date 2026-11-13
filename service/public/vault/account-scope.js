// Bind requests to the member whose content is on screen. A changed session
// invalidates every pending result before the shell clears/reopens the page.
export function createAccountScope({ member, changed }) {
  let generation = 0, invalid = false;
  const stale = () => Object.assign(new Error('The signed-in account changed. Reopening your vault.'), { code: 'AccountChanged' });
  return {
    reset() { generation++; invalid = false; },
    async run(send) {
      if (invalid) throw stale();
      const ticket = generation, did = member();
      try {
        const answer = await send(did ? { 'X-Ohm-Did': did } : {});
        if (ticket !== generation || did !== member()) throw stale();
        return answer;
      } catch (problem) {
        if (ticket !== generation || did !== member()) throw stale();
        if (did && ['AccountChanged', 'SignInRequired', 'AuthRequired', 'NotConnected'].includes(problem.code)) {
          invalid = true;
          generation++;
          changed();
        }
        throw problem;
      }
    },
  };
}
