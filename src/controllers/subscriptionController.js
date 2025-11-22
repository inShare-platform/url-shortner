const supabase = require('../config/supabase');

/**
 * Get all available plans
 * GET /api/plans
 */
const getPlans = async (req, res) => {
  try {
    const { data: plans, error } = await supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) {
      console.error('Error fetching plans:', error);
      return res.status(500).json({ error: 'Failed to fetch plans' });
    }

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    console.error('Error in getPlans:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Purchase/Activate a plan
 * POST /api/subscriptions/purchase
 * Body: { planId: string }
 */
const purchasePlan = async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    // Verify plan exists
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Check for existing active subscription
    const { data: existingSub } = await supabase
      .from('user_subscriptions')
      .select('id, plan_id, plans(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (existingSub) {
      return res.status(409).json({ 
        error: 'You already have an active subscription',
        message: `Current plan: ${existingSub.plans.name}. Please switch or cancel your current plan first.`
      });
    }

    // Create new subscription
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .insert([
        {
          user_id: userId,
          plan_id: planId,
          status: 'active',
          started_at: new Date().toISOString()
        }
      ])
      .select(`
        id,
        status,
        started_at,
        expires_at,
        plans (
          id,
          name,
          display_name,
          url_limit,
          price
        )
      `)
      .single();

    if (subError) {
      console.error('Error creating subscription:', subError);
      return res.status(500).json({ error: 'Failed to create subscription' });
    }

    res.status(201).json({
      success: true,
      message: `Successfully subscribed to ${plan.display_name} plan`,
      data: subscription
    });

  } catch (error) {
    console.error('Error in purchasePlan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Switch plan
 * PUT /api/subscriptions/switch
 * Body: { newPlanId: string }
 */
const switchPlan = async (req, res) => {
  try {
    const { newPlanId } = req.body;
    const userId = req.user.id;

    if (!newPlanId) {
      return res.status(400).json({ error: 'New plan ID is required' });
    }

    // Verify new plan exists
    const { data: newPlan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', newPlanId)
      .eq('is_active', true)
      .single();

    if (planError || !newPlan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Get current active subscription
    const { data: currentSub, error: subError } = await supabase
      .from('user_subscriptions')
      .select('id, plan_id, plans(name, display_name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError || !currentSub) {
      return res.status(404).json({ 
        error: 'No active subscription found',
        message: 'Please purchase a plan first'
      });
    }

    if (currentSub.plan_id === newPlanId) {
      return res.status(400).json({ 
        error: 'You are already on this plan'
      });
    }

    // Cancel current subscription
    await supabase
      .from('user_subscriptions')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', currentSub.id);

    // Create new subscription
    const { data: newSubscription, error: newSubError } = await supabase
      .from('user_subscriptions')
      .insert([
        {
          user_id: userId,
          plan_id: newPlanId,
          status: 'active',
          started_at: new Date().toISOString()
        }
      ])
      .select(`
        id,
        status,
        started_at,
        expires_at,
        plans (
          id,
          name,
          display_name,
          url_limit,
          price
        )
      `)
      .single();

    if (newSubError) {
      console.error('Error switching plan:', newSubError);
      return res.status(500).json({ error: 'Failed to switch plan' });
    }

    res.json({
      success: true,
      message: `Successfully switched from ${currentSub.plans.display_name} to ${newPlan.display_name}`,
      data: newSubscription
    });

  } catch (error) {
    console.error('Error in switchPlan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Cancel subscription (Enterprise users only)
 * DELETE /api/subscriptions/cancel
 */
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current active subscription
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select(`
        id,
        plan_id,
        plans (
          id,
          name,
          display_name
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ 
        error: 'No active subscription found'
      });
    }

    // Only Enterprise users can cancel
    if (subscription.plans.name !== 'enterprise') {
      return res.status(403).json({ 
        error: 'Only Enterprise users can cancel subscriptions',
        message: 'To change plans, please use the switch plan endpoint'
      });
    }

    // Cancel subscription
    const { error: cancelError } = await supabase
      .from('user_subscriptions')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', subscription.id);

    if (cancelError) {
      console.error('Error cancelling subscription:', cancelError);
      return res.status(500).json({ error: 'Failed to cancel subscription' });
    }

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    console.error('Error in cancelSubscription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get user quota information
 * GET /api/user/quota
 */
const getUserQuota = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get active subscription with plan details
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select(`
        id,
        status,
        started_at,
        plans (
          id,
          name,
          display_name,
          url_limit
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ 
        error: 'no_active_plan',
        message: 'No active subscription found. Please purchase a plan.'
      });
    }

    // Count user's URLs
    const { count: urlCount, error: countError } = await supabase
      .from('urls')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('Error counting URLs:', countError);
      return res.status(500).json({ error: 'Failed to fetch quota information' });
    }

    const urlLimit = subscription.plans.url_limit;
    const isUnlimited = urlLimit === null;
    const remaining = isUnlimited ? null : Math.max(0, urlLimit - (urlCount || 0));

    res.json({
      success: true,
      data: {
        plan: {
          name: subscription.plans.name,
          displayName: subscription.plans.display_name,
          urlLimit: isUnlimited ? 'unlimited' : urlLimit
        },
        usage: {
          used: urlCount || 0,
          remaining: isUnlimited ? 'unlimited' : remaining,
          isUnlimited
        }
      }
    });

  } catch (error) {
    console.error('Error in getUserQuota:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getPlans,
  purchasePlan,
  switchPlan,
  cancelSubscription,
  getUserQuota
};
