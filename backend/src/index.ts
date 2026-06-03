export const handler = async (event: string) => {
  return {
    event,
    statusCode: 200,
    body: JSON.stringify({ message: 'NeoFit Backend' }),
  };
};
