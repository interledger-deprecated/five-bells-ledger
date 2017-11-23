/**
 * @apiDefine InvalidUriParameterError
 *
 * @apiError InvalidUriParameterError (One of) the provided URI parameter(s)
 *   was invalid.
 *
 * @apiErrorExample InvalidUriParameterError
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "id": "InvalidUriParameterError",
 *       "message": "Error description here.",
 *       "validationErrors": [ ... ]
 *     }
 */

/**
 * @apiDefine InvalidBodyError
 *
 * @apiError InvalidBodyError The submitted JSON entity does not match the
 *   required schema.
 *
 * @apiErrorExample InvalidBodyError
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "id": "InvalidBodyError",
 *       "message": "Error description here.",
 *       "validationErrors": [ ... ]
 *     }
 */

/**
 * @apiDefine NotFoundError
 *
 * @apiError NotFoundError The requested resource could not be found.
 *
 * @apiErrorExample NotFoundError
 *     HTTP/1.1 404 Not Found
 *     {
 *       "id": "NotFoundError",
 *       "message": "Error description here."
 *     }
 */

/**
 * @apiDefine UnprocessableEntityError
 *
 * @apiError UnprocessableEntityError The provided entity is syntactically
 *   correct, but there is a generic semantic problem with it.
 *
 * @apiErrorExample UnprocessableEntityError
 *     HTTP/1.1 422 Unprocessable Entity
 *     {
 *       "id": "UnprocessableEntityError",
 *       "message": "Error description here."
 *     }
 */

/**
 * @apiDefine InsufficientFundsError
 *
 * @apiError InsufficientFundsError The source account does not have sufficient
 *   funds to satisfy the request.
 *
 * @apiErrorExample InsufficientFundsError
 *     HTTP/1.1 422 Unprocessable Entity
 *     {
 *       "id": "InsufficientFundsError",
 *       "message": "Error description here.",
 *       "owner": "bob"
 *     }
 */

/**
 * @apiDefine AlreadyExistsError
 *
 * @apiError AlreadyExistsError The specified entity already exists and may not
 *   be modified.
 *
 * @apiErrorExample AlreadyExistsError
 *     HTTP/1.1 422 Unprocessable Entity
 *     {
 *       "id": "AlreadyExistsError",
 *       "message": "Error description here."
 *     }
 */

/**
 * @apiDefine UnauthorizedError
 *
 * @apiError UnauthorizedError You do not have permissions to access this resource.
 *
 * @apiErrorExample UnauthorizedError
 *     HTTP/1.1 403 Forbidden
 *     {
 *       "id": "UnauthorizedError",
 *       "message": "Error description here."
 *     }
 */

/**
 * @apiDefine UnmetConditionError
 *
 * @apiError UnmetConditionError Execution Condition Not Met
 *
 * @apiErrorExample UnmetConditionError
 *     HTTP/1.1 422 Unprocessable Entity
 *     {
 *       "id": "UnmetConditionError",
 *       "message": "Error description here."
 *     }
 */

/**
 * @apiDefine NoSubscriptionsError
 *
 * @apiError NoSubscriptionsError Destination account could not be reached
 *
 * @apiErrorExample NoSubscriptionsError
 *     HTTP/1.1 422 Unprocessable Entity
 *     {
 *       "id": "NoSubscriptionsError",
 *       "message": "Error description here."
 *     }
 */
